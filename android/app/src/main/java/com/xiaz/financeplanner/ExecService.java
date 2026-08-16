package com.xiaz.financeplanner;

import android.content.Context;
import android.os.RemoteException;

import androidx.annotation.Keep;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Shizuku UserService 实现：跑在独立进程中，以 shell (uid 2000) 身份执行命令。
 *
 * 注意（Shizuku 官方文档约束）：本进程不是标准 App 进程，
 * 只能做纯计算/命令执行，不能依赖 Context 各类系统服务。
 */
public class ExecService extends IExecService.Stub {

    /** 无参构造（Shizuku v12 及以下使用） */
    public ExecService() {
    }

    /** 带 Context 构造（Shizuku v13+ 优先调用，需 @Keep 防 ProGuard 裁剪） */
    @Keep
    public ExecService(Context context) {
    }

    /** Shizuku server 保留销毁方法 */
    @Override
    public void destroy() {
        System.exit(0);
    }

    @Override
    public String exec(String cmd) throws RemoteException {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});
            String out = readAll(p.getInputStream());
            String err = readAll(p.getErrorStream());
            int code = p.waitFor();
            return code + "\n" + ((out + "\n" + err).trim());
        } catch (Exception e) {
            return "-1\n" + e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }

    private static String readAll(java.io.InputStream is) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
        }
        return sb.toString().trim();
    }
}
