package com.xiaz.financeplanner;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Window;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

import java.util.Locale;

/**
 * 冷静期锁屏页（原生实现，秒开，不依赖 WebView）。
 *
 * 防绕过设计：
 * - 无任何跳过/解锁按钮，唯一出口是“回桌面”
 * - 返回键 → 回桌面，绝不 finish 回到微信
 * - excludeFromRecents，不出现在最近任务
 * - 倒计时归零自动放行（时间戳为准，重启 App 也不重置）
 */
public class LockScreenActivity extends AppCompatActivity {

    /** 供无障碍服务去重：锁屏是否已在前台 */
    public static volatile boolean isShowing = false;

    private static final long TICK_MS = 30_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView countdownText;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (isFinishing() || isDestroyed()) return;
            if (!LockStore.isLocked(LockScreenActivity.this)) {
                goHome();
                return;
            }
            long remain = LockStore.endsAt(LockScreenActivity.this) - System.currentTimeMillis();
            countdownText.setText(formatRemain(Math.max(remain, 0)));
            handler.postDelayed(this, TICK_MS);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        // 弹出时保持亮屏，确保用户第一眼看到锁定状态
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_lock_screen);
        isShowing = true;

        countdownText = findViewById(R.id.lock_countdown);
        TextView labelsText = findViewById(R.id.lock_labels);
        String labels = LockStore.labels(this);
        labelsText.setText(labels == null || labels.isEmpty() ? "正在为钱包冷静" : labels);

        findViewById(R.id.lock_btn_home).setOnClickListener(v -> goHome());

        // 返回手势/返回键 → 回桌面，不能回到被锁的微信
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                goHome();
            }
        });

        // 不在锁定期（已被清除或到期）则不应展示
        if (!LockStore.isLocked(this)) {
            goHome();
            return;
        }
        tick.run();
    }

    private void goHome() {
        handler.removeCallbacks(tick);
        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        home.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        startActivity(home);
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(tick);
        isShowing = false;
        super.onDestroy();
    }

    private static String formatRemain(long ms) {
        long totalMin = ms / 60_000L;
        long days = totalMin / (24 * 60);
        long hours = (totalMin % (24 * 60)) / 60;
        long minutes = totalMin % 60;

        if (days > 0) return String.format(Locale.CHINA, "%d 天 %d 小时", days, hours);
        if (hours > 0) return String.format(Locale.CHINA, "%d 小时 %d 分", hours, minutes);
        return String.format(Locale.CHINA, "%d 分钟", Math.max(minutes, 1));
    }
}
