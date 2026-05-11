package live.omni.radio;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import live.omni.radio.proxy.LocalProxy;

public class MainActivity extends BridgeActivity {

    private LocalProxy proxy;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            proxy = new LocalProxy();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();

        if (proxy != null) {
            proxy.stop();
        }
    }
}