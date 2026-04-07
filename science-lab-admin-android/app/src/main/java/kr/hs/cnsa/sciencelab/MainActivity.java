package kr.hs.cnsa.sciencelab;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * 메인 액티비티 - WebView로 GAS 웹앱을 전체화면 표시
 * 폰/태블릿 모두 지원 (screenOrientation="unspecified")
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ProgressBar progressBar;
    private SwipeRefreshLayout swipeRefresh;
    private View errorView;
    private boolean isErrorShown = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Edge-to-edge 전체화면
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        errorView = findViewById(R.id.errorView);

        setupWebView();
        setupSwipeRefresh();

        // 웹앱 로드
        webView.loadUrl(BuildConfig.WEB_APP_URL);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();

        // JavaScript 필수 (GAS 웹앱)
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        // 반응형 지원
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        // 캐시 설정
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // 줌 설정 (태블릿에서 유용)
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false); // 줌 버튼 숨김

        // 폰트 크기 (접근성)
        settings.setTextZoom(100);

        // 쿠키 (Google 로그인용)
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // 파일 업로드 지원
        settings.setAllowFileAccess(true);

        // WebViewClient - 페이지 로딩 이벤트
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                progressBar.setVisibility(View.VISIBLE);
                if (isErrorShown) {
                    errorView.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    isErrorShown = false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);
                swipeRefresh.setRefreshing(false);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showError();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();

                // Google 인증/GAS 관련 URL은 WebView 내에서 처리
                if (url.contains("google.com") || url.contains("googleapis.com") ||
                    url.contains("gstatic.com") || url.contains("accounts.google")) {
                    return false;
                }

                // 외부 링크는 브라우저로
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }
        });

        // WebChromeClient - 진행률 표시
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                if (newProgress >= 100) {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setColorSchemeResources(
            android.R.color.holo_blue_bright,
            android.R.color.holo_green_light
        );
        swipeRefresh.setOnRefreshListener(() -> {
            if (isErrorShown) {
                errorView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                isErrorShown = false;
            }
            webView.reload();
        });
    }

    private void showError() {
        progressBar.setVisibility(View.GONE);
        swipeRefresh.setRefreshing(false);
        webView.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
        isErrorShown = true;

        // 재시도 버튼
        View retryBtn = errorView.findViewById(R.id.btnRetry);
        if (retryBtn != null) {
            retryBtn.setOnClickListener(v -> {
                errorView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                isErrorShown = false;
                webView.loadUrl(BuildConfig.WEB_APP_URL);
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
