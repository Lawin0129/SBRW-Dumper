const https = require("https");
const http = require("http");
const zlib = require("zlib");

function decompressBody(buffer, encoding) {
    encoding = (encoding || "").toLowerCase();
    
    if (!buffer || (buffer.length == 0)) {
        return Promise.resolve(buffer);
    }

    return new Promise((resolve, reject) => {
        if (encoding == "gzip") {
            zlib.gunzip(buffer, (err, decoded) => err ? reject(err) : resolve(decoded));
        } else if (encoding == "deflate") {
            zlib.inflate(buffer, (err, decoded) => err ? reject(err) : resolve(decoded));
        } else if (encoding == "br") {
            if ((typeof zlib.brotliDecompress) == "function") {
                zlib.brotliDecompress(buffer, (err, decoded) => err ? reject(err) : resolve(decoded));
            } else {
                reject(new Error("Brotli encoding not supported in this Node version."));
            }
        } else {
            resolve(buffer);
        }
    });
}

function makeRequest(method, url, { headers = {}, body, timeoutMS = 60000 } = {}) {
    const requestModule = url.toLowerCase().startsWith("https:") ? https : http;
    let isDone = false;
    
    return new Promise((resolve, reject) => {
        const req = requestModule.request(url, { method, headers }, (res) => {
            let resData = [];
            
            res.on("error", reject);
            res.on("data", (chunk) => resData.push(chunk));
            res.on("end", () => {
                if (isDone) return;
                isDone = true;

                const buffer = Buffer.concat(resData);
                const encoding = res.headers["content-encoding"];

                decompressBody(buffer, encoding).then(decodedBuffer => {
                    const dataString = decodedBuffer.toString("utf8");

                    let respData = {
                        status: res.statusCode,
                        headers: res.headers,
                        data: dataString
                    };
                    
                    const contentType = (res.headers["content-type"] ?? "").toLowerCase();
                    const isJSON = contentType.includes("json");
                    
                    try {
                        if (isJSON) respData.data = JSON.parse(dataString);
                    } catch {}
                    
                    if (res.statusCode >= 400) {
                        reject(respData);
                        return;
                    }
                    
                    resolve(respData);
                }).catch(err => reject(err));
            });
        });
        
        if (timeoutMS && (timeoutMS > 0)) {
            req.setTimeout(timeoutMS, () => {
                if (isDone) return;
                req.destroy(new Error(`Request timed out after ${timeoutMS}ms`));
                isDone = true;
            });
        }
        
        req.on("error", reject);
        
        if (body != undefined) {
            let payload;

            if (Buffer.isBuffer(body)) {
                payload = body;
            } else if ((typeof body) == "object") {
                try {
                    payload = JSON.stringify(body);
                } catch (err) {
                    req.destroy(err);
                    return;
                }
                
                const hasContentType = Object.keys(headers).some(k => k.toLowerCase() == "content-type");
                
                if (!hasContentType) {
                    req.setHeader("Content-Type", "application/json");
                }
            } else {
                payload = `${body}`;
            }

            req.write(payload);
        }

        req.end();
    });
}

module.exports = {
    get: (url, headers = {}) => makeRequest("GET", url, { headers }),
    post: (url, body, headers = {}) => makeRequest("POST", url, { headers, body }),
    put: (url, body, headers = {}) => makeRequest("PUT", url, { headers, body }),
    patch: (url, body, headers = {}) => makeRequest("PATCH", url, { headers, body }),
    delete: (url, headers = {}) => makeRequest("DELETE", url, { headers }),
    head: (url, headers = {}) => makeRequest("HEAD", url, { headers }),
    options: (url, headers = {}) => makeRequest("OPTIONS", url, { headers }),
    request: makeRequest
}
