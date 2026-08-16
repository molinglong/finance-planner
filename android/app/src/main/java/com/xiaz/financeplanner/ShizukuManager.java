package com.xiaz.financeplanner;

import android.content.ComponentName;
import android.content.Context;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.IBinder;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import rikka.shizuku.Shizuku;

/**
 * Shizuku 桥接管理：冷静期精确锁定目标 App（如 QQ）。
 *
 * 原理：pm suspend <pkg> 挂起 user 0 的实例（图标保留、点击被系统拦截，
 * 物理上无法启动）；如有分身（旧微信分身场景）再逐用户挂起。
 * unsuspend 立即恢复。
 *
 * 命令通过 Shizuku UserService（ExecService，shell 身份独立进程）执行。
 * 注意：所有 shell 方法都可能阻塞，严禁在主线程调用。
 */
public final class ShizukuManager {

    private static final String TAG = "ShizukuManager";
    private static final Pattern USER_INFO = Pattern.compile("UserInfo\\{(\\d+):");

    /** 绑定的 UserService 代理（Shizuku 停止时置空） */
    private static volatile IExecService service;
    private static final Object BIND_LOCK = new Object();

    private ShizukuManager() {}

    /** Shizuku 服务是否在线（未安装/未激活均返回 false） */
    static boolean isAlive() {
        try {
            return Shizuku.pingBinder();
        } catch (Exception e) {
            return false;
        }
    }

    /** 是否已授权本 App 使用 Shizuku */
    static boolean hasPermission() {
        try {
            if (!isAlive() || Shizuku.isPreV11()) return false;
            return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            return false;
        }
    }

    /** 请求授权（结果异步，由系统弹窗回调，前端轮询 hasPermission 即可） */
    static boolean requestPermission(int requestCode) {
        try {
            if (!isAlive() || Shizuku.isPreV11()) return false;
            if (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED) return true;
            Shizuku.requestPermission(requestCode);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 确保 UserService 已绑定（含 binder 存活检查与重绑），失败返回 null */
    private static IExecService ensureService(Context ctx) {
        IExecService s = service;
        if (s != null && s.asBinder().pingBinder()) return s;
        synchronized (BIND_LOCK) {
            s = service;
            if (s != null && s.asBinder().pingBinder()) return s;
            try {
                Shizuku.UserServiceArgs args = new Shizuku.UserServiceArgs(
                        new ComponentName(ctx, ExecService.class))
                    .processNameSuffix("exec")
                    .version(1)
                    .tag("exec");

                CountDownLatch latch = new CountDownLatch(1);
                final IExecService[] holder = new IExecService[1];
                Shizuku.bindUserService(args, new ServiceConnection() {
                    @Override
                    public void onServiceConnected(ComponentName name, IBinder binder) {
                        holder[0] = IExecService.Stub.asInterface(binder);
                        latch.countDown();
                    }

                    @Override
                    public void onServiceDisconnected(ComponentName name) {
                        service = null;
                    }
                });
                if (!latch.await(5, TimeUnit.SECONDS)) return null;
                service = holder[0];
                return service;
            } catch (Throwable t) {
                android.util.Log.w(TAG, "bindUserService failed: " + t);
                return null;
            }
        }
    }

    /** 以 shell 权限执行命令，返回 [exitCode, stdout+stderr]；失败返回 ["-1", 错误] */
    private static String[] run(Context ctx, String cmd) {
        IExecService s = ensureService(ctx);
        if (s == null) {
            android.util.Log.w(TAG, "run: service unavailable, cmd=" + cmd);
            return new String[]{"-1", "shizuku service unavailable"};
        }
        try {
            String result = s.exec(cmd);
            int idx = result.indexOf('\n');
            String[] parsed = idx < 0
                ? new String[]{result, ""}
                : new String[]{result.substring(0, idx), result.substring(idx + 1)};
            android.util.Log.i(TAG, "run: cmd=[" + cmd + "] exit=" + parsed[0] + " out=" + parsed[1].substring(0, Math.min(parsed[1].length(), 200)));
            return parsed;
        } catch (Throwable t) {
            service = null; // binder 已死，下次重绑
            android.util.Log.w(TAG, "run: exception cmd=" + cmd + " " + t);
            return new String[]{"-1", t.getClass().getSimpleName() + ": " + t.getMessage()};
        }
    }

    /** 探测目标包的所有分身用户 id（非 0 用户且已安装目标包） */
    static List<Integer> detectCloneUserIds(Context ctx, String pkg) {
        List<Integer> result = new ArrayList<>();
        String[] r = run(ctx, "pm list users");
        if (!"0".equals(r[0])) return result;
        Matcher m = USER_INFO.matcher(r[1]);
        List<Integer> nonPrimary = new ArrayList<>();
        while (m.find()) {
            try {
                int id = Integer.parseInt(m.group(1));
                if (id != 0) nonPrimary.add(id);
            } catch (NumberFormatException ignored) {
            }
        }
        for (int id : nonPrimary) {
            String[] pr = run(ctx, "pm path --user " + id + " " + pkg);
            if ("0".equals(pr[0])) result.add(id);
        }
        return result;
    }

    /** 挂起目标包（user 0 + 分身用户）。返回是否至少 user 0 成功 */
    static boolean suspendClones(Context ctx, String pkg) {
        boolean anyOk = false;
        // 挂起主用户 (user 0) 实例
        String[] r0 = run(ctx, "pm suspend " + pkg);
        if ("0".equals(r0[0])) {
            anyOk = true;
        } else {
            android.util.Log.w(TAG, "suspend user 0 failed: " + r0[1]);
        }
        // 挂起分身用户实例（兼容旧微信分身场景）
        List<Integer> ids = detectCloneUserIds(ctx, pkg);
        for (int id : ids) {
            String[] r = run(ctx, "pm suspend --user " + id + " " + pkg);
            if (!"0".equals(r[0])) {
                android.util.Log.w(TAG, "suspend user " + id + " failed: " + r[1]);
                anyOk = false;
            }
        }
        return anyOk;
    }

    /** 恢复目标包（user 0 + 分身用户） */
    static boolean unsuspendClones(Context ctx, String pkg) {
        boolean anyOk = true;
        // 恢复主用户 (user 0) 实例
        String[] r0 = run(ctx, "pm unsuspend " + pkg);
        if (!"0".equals(r0[0])) {
            android.util.Log.w(TAG, "unsuspend user 0 failed: " + r0[1]);
            anyOk = false;
        }
        // 恢复分身用户实例
        List<Integer> ids = detectCloneUserIds(ctx, pkg);
        for (int id : ids) {
            String[] r = run(ctx, "pm unsuspend --user " + id + " " + pkg);
            if (!"0".equals(r[0])) {
                android.util.Log.w(TAG, "unsuspend user " + id + " failed: " + r[1]);
                anyOk = false;
            }
        }
        return anyOk;
    }

    /**
     * 查询分身当前是否处于挂起状态（任一挂起即 true）。
     *
     * Android 16 的 pm list packages 已移除 --suspended 过滤项，
     * 改用 dumpsys package 解析 "User <id>: ... suspended=true ..." 行。
     */
    static boolean isCloneSuspended(Context ctx, String pkg) {
        String[] r = run(ctx, "dumpsys package " + pkg);
        if (!"0".equals(r[0])) return false;
        // 检查主用户 (user 0)
        for (String line : r[1].split("\n")) {
            if (line.contains("User 0:") && line.contains("suspended=true")) {
                return true;
            }
        }
        // 检查分身用户
        List<Integer> ids = detectCloneUserIds(ctx, pkg);
        for (int id : ids) {
            String marker = "User " + id + ":";
            for (String line : r[1].split("\n")) {
                if (line.contains(marker) && line.contains("suspended=true")) {
                    return true;
                }
            }
        }
        return false;
    }
}
