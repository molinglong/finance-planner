package com.xiaz.financeplanner;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 冷静期应用锁状态存储（SharedPreferences）。
 *
 * 唯一真相源：endsAt 时间戳。无障碍服务每次窗口事件时读取判断，
 * 即使前端进程被杀，倒计时到点也会自动放行，不会永久锁死。
 *
 * 时间回拨防护：记录运行期间见过的最大系统时间 maxSeen，
 * 若系统时间被回拨超过 ROLLBACK_GRACE，视为篡改，维持锁定。
 */
public final class LockStore {

    private static final String PREFS = "app_lock";
    private static final String KEY_ENDS_AT = "ends_at";
    private static final String KEY_LABELS = "labels";
    private static final String KEY_TARGET_PKG = "target_pkg";
    private static final String KEY_MAX_SEEN = "max_seen";

    /** 无障碍拦截范围：none=不拦（Shizuku 精确锁已生效）；all=兜底锁QQ */
    private static final String KEY_SCOPE = "lock_scope";

    /** 正常 NTP 校时的回拨在分钟级，超过 2 小时视为人为篡改 */
    private static final long ROLLBACK_GRACE = 2 * 60 * 60 * 1000L;

    private LockStore() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 前端同步冷静期状态（endsAt 为 0/null 表示清除锁定） */
    static void sync(Context ctx, long endsAt, String labels) {
        prefs(ctx).edit()
            .putLong(KEY_ENDS_AT, endsAt)
            .putString(KEY_LABELS, labels == null ? "" : labels)
            .apply();
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().remove(KEY_ENDS_AT).remove(KEY_LABELS).apply();
    }

    static long endsAt(Context ctx) {
        return prefs(ctx).getLong(KEY_ENDS_AT, 0L);
    }

    static String labels(Context ctx) {
        return prefs(ctx).getString(KEY_LABELS, "");
    }

    static String targetPackage(Context ctx) {
        return prefs(ctx).getString(KEY_TARGET_PKG, "com.tencent.mobileqq");
    }

    /** 当前是否处于锁定期（含时间回拨防护） */
    static boolean isLocked(Context ctx) {
        long now = observeNow(ctx);
        long endsAt = endsAt(ctx);
        if (endsAt <= 0) return false;
        return now < endsAt;
    }

    /** 无障碍兜底是否需要拦截（仅 Shizuku 精确锁定失败/离线时为 all） */
    static boolean shouldBlockByAccessibility(Context ctx) {
        return isLocked(ctx) && "all".equals(prefs(ctx).getString(KEY_SCOPE, "all"));
    }

    static void setScope(Context ctx, String scope) {
        prefs(ctx).edit().putString(KEY_SCOPE, scope).apply();
    }

    static String scope(Context ctx) {
        return prefs(ctx).getString(KEY_SCOPE, "all");
    }

    /** 记录并返回当前时间；若相对 maxSeen 出现大幅回拨，返回 maxSeen（维持锁定判定） */
    private static long observeNow(Context ctx) {
        long now = System.currentTimeMillis();
        long maxSeen = prefs(ctx).getLong(KEY_MAX_SEEN, 0L);
        if (now > maxSeen) {
            prefs(ctx).edit().putLong(KEY_MAX_SEEN, now).apply();
            return now;
        }
        if (maxSeen - now > ROLLBACK_GRACE) {
            // 时间被大幅回拨：按锁定处理，直到“真实时间”重新追上 endsAt
            return maxSeen;
        }
        return now;
    }

    /** 调试用：设置锁定目标包名（仅 debuggable 构建生效，由 DebugLockReceiver 调用） */
    static void setDebugTarget(Context ctx, String pkg) {
        prefs(ctx).edit().putString(KEY_TARGET_PKG, pkg).apply();
    }
}
