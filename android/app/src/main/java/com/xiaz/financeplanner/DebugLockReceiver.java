package com.xiaz.financeplanner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;

/**
 * 模拟器/真机调试用广播接收器（release 构建自动失效）。
 *
 * 用法：
 *   设置锁定目标：adb shell am broadcast -a com.xiaz.financeplanner.DEBUG_LOCK_TARGET \
 *       --es pkg com.android.settings
 *   直接注入锁：  adb shell am broadcast -a com.xiaz.financeplanner.DEBUG_SET_LOCK \
 *       --el endsAt 1893456000000 --es labels "正在冷静：机械键盘"
 */
public class DebugLockReceiver extends BroadcastReceiver {

    static final String ACTION_TARGET = "com.xiaz.financeplanner.DEBUG_LOCK_TARGET";
    static final String ACTION_SET_LOCK = "com.xiaz.financeplanner.DEBUG_SET_LOCK";

    @Override
    public void onReceive(Context context, Intent intent) {
        // 仅 debuggable 构建生效（模拟器验证用，release 自动短路）
        if ((context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return;

        String action = intent.getAction();
        if (ACTION_TARGET.equals(action)) {
            String pkg = intent.getStringExtra("pkg");
            if (pkg != null && !pkg.isEmpty()) {
                LockStore.setDebugTarget(context, pkg);
            }
        } else if (ACTION_SET_LOCK.equals(action)) {
            long endsAt = intent.getLongExtra("endsAt", 0L);
            String labels = intent.getStringExtra("labels");
            if (endsAt > 0) {
                LockStore.sync(context, endsAt, labels);
            } else {
                LockStore.clear(context);
            }
        }
    }
}
