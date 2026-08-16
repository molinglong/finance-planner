package com.xiaz.financeplanner;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import android.os.SystemClock;

/**
 * 冷静期应用锁无障碍服务。
 *
 * 原理（与市面 AppLock 类软件一致）：
 * 监听窗口切换事件 → 目标包名（默认QQ com.tencent.mobileqq）→ 若处于冷静期内 →
 * 立即用全屏锁屏 Activity 盖住。
 *
 * 仅作为 Shizuku 离线时的兑底手段（scope='all'）；
 * Shizuku 精确挂起生效时 scope='none' 不拦截。
 */
public class AppLockAccessibilityService extends AccessibilityService {

    private static final String TAG = "AppLock";

    /** 事件节流：同一窗口 500ms 内不重复处理 */
    private long lastHandledAt = 0L;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            && type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return;

        CharSequence pkgSeq = event.getPackageName();
        if (pkgSeq == null) return;
        if (!LockStore.targetPackage(this).contentEquals(pkgSeq)) return;

        long now = SystemClock.elapsedRealtime();
        if (now - lastHandledAt < 500L) return;

        Log.d(TAG, "event type=0x" + Integer.toHexString(type)
            + " pkg=" + pkgSeq + " locked=" + LockStore.isLocked(this)
            + " showing=" + LockScreenActivity.isShowing);

        if (!LockStore.shouldBlockByAccessibility(this)) return;

        // 锁屏已在前台时避免重复启动
        if (LockScreenActivity.isShowing) return;

        lastHandledAt = now;

        Intent intent = new Intent(this, LockScreenActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        try {
            startActivity(intent);
        } catch (Exception ignored) {
            // 极端情况（如系统限制后台启动）忽略本次，下次窗口事件重试
        }
    }

    @Override
    public void onInterrupt() {
        // 无需处理
    }
}
