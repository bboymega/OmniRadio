package live.omni.radio.proxy;

import java.io.IOException;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.ResponseBody;

public class LocalProxy extends NanoHTTPD {

    private final OkHttpClient client =
        new OkHttpClient();

    public LocalProxy() throws IOException {
        super("127.0.0.87", 8787);
        start(SOCKET_READ_TIMEOUT, false);
    }

    @Override
    public Response serve(IHTTPSession session) {

        try {

            Map<String, String> params =
                session.getParms();

            String target =
                params.get("url");

            if (target == null || target.isEmpty()) {
                return newFixedLengthResponse(
                    Response.Status.BAD_REQUEST,
                    "text/plain",
                    "Missing url param"
                );
            }

            Request request =
                new Request.Builder()
                    .url(target)
                    .header(
                        "User-Agent",
                        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36"
                    )
                    .build();

            okhttp3.Response remote =
                client.newCall(request)
                    .execute();

            ResponseBody body =
                remote.body();

            if (body == null) {
                return newFixedLengthResponse(
                    Response.Status.NO_CONTENT,
                    "text/plain",
                    "Empty body"
                );
            }

            Response response =
                newChunkedResponse(
                    Response.Status.OK,
                    remote.header(
                        "Content-Type",
                        "audio/mpeg"
                    ),
                    body.byteStream()
                );

            response.addHeader(
                "Access-Control-Allow-Origin",
                "*"
            );

            return response;

        } catch (Exception e) {

            return newFixedLengthResponse(
                Response.Status.INTERNAL_ERROR,
                "text/plain",
                e.toString()
            );
        }
    }
}
