// wap-bd.js — 通用 WAP CONNECT 伪装脚本（改进版）
// 说明：把本文件上传到 HTTPS raw 链接，并在 Loon 的 Proxy 中把 script-path 指向这个 URL。

let HTTP_STATUS_INVALID = -1;
let HTTP_STATUS_CONNECTED = 0;
let HTTP_STATUS_WAITRESPONSE = 1;
let HTTP_STATUS_FORWARDING = 2;
var httpStatus = HTTP_STATUS_INVALID;

function tunnelDidConnected() {
    console.log("[wap-bd] tunnelDidConnected session:", JSON.stringify($session));
    if ($session.proxy && $session.proxy.isTLS) {
        console.log("[wap-bd] underlying proxy uses TLS; wait for tunnelTLSFinished");
    } else {
        _writeHttpHeader();
        httpStatus = HTTP_STATUS_CONNECTED;
    }
    return true;
}

function tunnelTLSFinished() {
    console.log("[wap-bd] tunnelTLSFinished - writing CONNECT");
    _writeHttpHeader();
    httpStatus = HTTP_STATUS_CONNECTED;
    return true;
}

function tunnelDidRead(data) {
    try {
        if (httpStatus === HTTP_STATUS_WAITRESPONSE) {
            // We read the HTTP header block to check response code
            let txt = (data && data.toString) ? data.toString() : String(data || "");
            console.log("[wap-bd] waiting response, head preview:", txt.substring(0, 200));
            if (/HTTP\/\d\.\d\s+200/i.test(txt)) {
                console.log("[wap-bd] HTTP CONNECT 200 OK -> established");
                httpStatus = HTTP_STATUS_FORWARDING;
                $tunnel.established($session);
            } else {
                console.log("[wap-bd] CONNECT not OK, first line:", txt.split("\r\n")[0]);
                // close to allow fallback
                try { $tunnel.close($session); } catch(e) { console.log("[wap-bd] close error", e); }
            }
            return null;
        } else if (httpStatus === HTTP_STATUS_FORWARDING) {
            return data;
        } else {
            return data;
        }
    } catch (e) {
        console.log("[wap-bd] tunnelDidRead error:", e);
        try { $tunnel.close($session); } catch(e2) {}
        return null;
    }
}

function tunnelDidWrite() {
    if (httpStatus === HTTP_STATUS_CONNECTED) {
        console.log("[wap-bd] write CONNECT header done, waiting response");
        httpStatus = HTTP_STATUS_WAITRESPONSE;
        // Read until end of HTTP header
        $tunnel.readTo($session, "\x0D\x0A\x0D\x0A");
        return false; // suspend further writes until response processed
    }
    return true;
}

function tunnelDidClose() {
    console.log("[wap-bd] tunnelDidClose");
    httpStatus = HTTP_STATUS_INVALID;
    return true;
}

function _writeHttpHeader() {
    try {
        let conHost = $session.conHost || "127.0.0.1";
        let conPort = $session.conPort || 80;

        // ======= 填写你的伪装值（根据运营商/测试结果调整） =======
        // hostForFake: 通常填免流的 Host 或 IP:port（示例）
        let hostForFake = "mmsc.vnet.mobi:80";
        // X-Online-Host：许多免流场景需要该 header
        let xonline = "mmsc.vnet.mobi";
        // 可伪装的 User-Agent
        let ua = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36";
        // 额外 header（按需开启/注释）
        let extraHeaders = [
            `X-Forwarded-For: 10.0.0.172`,
            // `Referer: https://mmsc.vnet.mobi/`,
            // `Accept: */*`
        ];
        // ======================================================

        // 注意 CONNECT 行必须有空格： "CONNECT host:port HTTP/1.1"
        var header =
            `CONNECT ${conHost}:${conPort} HTTP/1.1\r\n` +
            `Host: ${hostForFake}\r\n` +
            `X-Online-Host: ${xonline}\r\n` +
            `User-Agent: ${ua}\r\n` +
            `Connection: keep-alive\r\n` +
            `Proxy-Connection: keep-alive\r\n` +
            `${extraHeaders.join("\r\n")}\r\n` +
            `\r\n`;

        console.log("[wap-bd] send header preview:", header.replace(/\r\n/g, "\\r\\n").substring(0, 300));
        $tunnel.write($session, header);
    } catch (e) {
        console.log("[wap-bd] _writeHttpHeader error:", e);
    }
}