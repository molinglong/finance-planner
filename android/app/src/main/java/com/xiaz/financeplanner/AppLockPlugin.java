package com.xiaz.financeplanner;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 前端 ↔ 原生锁状态桥。
 *
 * applyLockState 为统一入口（前端在冷静期创建/到期/清除时调用）：
 * - 锁定期内 + Shizuku 可用 → pm suspend 目标App如QQ（图标保留、系统拦截启动），无障碍不拦
 * - 锁定期内 + Shizuku 不可用 → 退回无障碍兑底锁目标App（防“故意不激活 Shizuku”绕过）
 * - 锁定期结束 → unsuspend 恢复（Shizuku 离线时提示，恢复失败保持挂起=安全方向）
 */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    private static final int SHIZUKU_REQUEST_CODE = 101;

    /** shell/binder 调用专用线程（阻塞操作严禁上主线程） */
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /**
     * 统一同步入口：endsAt 为空/过去时清除锁并尝试恢复分身；否则锁定。
     * 在后台线程执行（suspend/unsuspend 是 shell 调用，可能耗时数百毫秒）。
     */
    @PluginMethod
    public void applyLockState(PluginCall call) {
        executor.execute(() -> doApplyLockState(call));
    }

    private void doApplyLockState(PluginCall call) {
        Long endsAt = call.getLong("endsAt");
        String labels = call.getString("labels", "");
        Context ctx = getContext();
        boolean locked = endsAt != null && endsAt > System.currentTimeMillis();

        String scope;
        boolean cloneSuspended = false;
        String shizukuMode;

        if (!locked) {
            LockStore.clear(ctx);
            // 尝试恢复分身（无分身/Shizuku 离线时保持现状）
            if (ShizukuManager.hasPermission()) {
                boolean ok = ShizukuManager.unsuspendClones(ctx, LockStore.targetPackage(ctx));
                shizukuMode = ok ? "restored" : "restore_failed";
            } else {
                shizukuMode = "offline";
            }
            LockStore.setScope(ctx, "none");
            scope = "none";
        } else {
            LockStore.sync(ctx, endsAt, labels);
            if (ShizukuManager.hasPermission()) {
                boolean ok = ShizukuManager.suspendClones(ctx, LockStore.targetPackage(ctx));
                if (ok) {
                    LockStore.setScope(ctx, "none"); // 精确锁定生效，无障碍不拦
                    scope = "none";
                    shizukuMode = "suspended";
                    cloneSuspended = true;
                } else {
                    LockStore.setScope(ctx, "all"); // 挂起失败（如未找到分身）→ 兑底锁全部
                    scope = "all";
                    shizukuMode = "suspend_failed";
                }
            } else {
                LockStore.setScope(ctx, "all"); // Shizuku 离线/未授权 → 兑底锁全部
                scope = "all";
                shizukuMode = "offline";
            }
        }

        JSObject ret = new JSObject();
        ret.put("locked", LockStore.isLocked(ctx));
        ret.put("scope", scope);
        ret.put("shizukuMode", shizukuMode);
        ret.put("cloneSuspended", cloneSuspended);
        call.resolve(ret);
    }

    /** 请求 Shizuku 授权（系统弹窗，结果由前端轮询 getLockState） */
    @PluginMethod
    public void requestShizukuPermission(PluginCall call) {
        boolean requested = ShizukuManager.requestPermission(SHIZUKU_REQUEST_CODE);
        JSObject ret = new JSObject();
        ret.put("requested", requested);
        call.resolve(ret);
    }

    @PluginMethod
    public void getLockState(PluginCall call) {
        executor.execute(() -> {
            Context ctx = getContext();
            JSObject ret = new JSObject();
            ret.put("active", LockStore.isLocked(ctx));
            ret.put("endsAt", LockStore.endsAt(ctx));
            ret.put("labels", LockStore.labels(ctx));
            ret.put("scope", LockStore.scope(ctx));
            ret.put("serviceEnabled", isServiceEnabled(ctx));

            boolean shizukuAlive = ShizukuManager.isAlive();
            ret.put("shizukuAlive", shizukuAlive);
            ret.put("shizukuGranted", ShizukuManager.hasPermission());
            ret.put("cloneSuspended", shizukuAlive && ShizukuManager.hasPermission()
                && ShizukuManager.isCloneSuspended(ctx, LockStore.targetPackage(ctx)));
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开无障碍设置: " + e.getMessage());
        }
    }

    /** 无障碍服务是否已在系统设置中启用 */
    static boolean isServiceEnabled(Context ctx) {
        String expected = new ComponentName(ctx, AppLockAccessibilityService.class)
            .flattenToString();
        String enabled = Settings.Secure.getString(
            ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabled);
        while (splitter.hasNext()) {
            if (expected.equals(splitter.next())) return true;
        }
        return false;
    }
}
