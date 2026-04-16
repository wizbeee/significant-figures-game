package kr.hs.cnsa.sciencelab;

import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

/**
 * 스플래시 화면 - 앱 시작 시 로고/타이틀 표시 후 메인으로 이동
 */
public class SplashActivity extends AppCompatActivity {

    private static final long SPLASH_DELAY = 1500; // 1.5초

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (isNetworkAvailable()) {
                startActivity(new Intent(this, MainActivity.class));
            } else {
                Toast.makeText(this, "인터넷 연결을 확인해주세요.", Toast.LENGTH_LONG).show();
                // 재시도 버튼 없이 3초 후 재확인
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    if (isNetworkAvailable()) {
                        startActivity(new Intent(this, MainActivity.class));
                    } else {
                        Toast.makeText(this, "인터넷에 연결되지 않아 앱을 종료합니다.", Toast.LENGTH_SHORT).show();
                    }
                    finish();
                }, 3000);
                return;
            }
            finish();
        }, SPLASH_DELAY);
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }
}
