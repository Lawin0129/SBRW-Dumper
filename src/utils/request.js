const https = require("https");
const http = require("http");
const zlib = require("zlib");

function decompressBody(buffer, encoding) {
    encoding = (encoding || "").toLowerCase();
    
    if (!buffer || (buffer.length == 0)) {
        return Promise.resolve(buffer);
    }

    return new Promise((resolve, reject) => {
        switch (encoding) {
            case "gzip": {
                zlib.gunzip(buffer, (err, decoded) => err ? reject(err) : resolve(decoded));
                break;
            }

            case "deflate": {
                zlib.inflate(buffer, (err, decoded) => {
                    if (!err) return resolve(decoded);
                    
                    // fallback for some servers that send raw deflate
                    zlib.inflateRaw(buffer, (err2, decoded2) => {
                        if (err2) return reject(err);
                        resolve(decoded2);
                    });
                });
                break;
            }

            case "br": {
                if ((typeof zlib.brotliDecompress) == "function") {
                    zlib.brotliDecompress(buffer, (err, decoded) => err ? reject(err) : resolve(decoded));
                } else {
                    reject(new Error("Brotli encoding not supported in this Node version."));
                }
                break;
            }
            
            case "zstd": {
                if ((typeof zlib.zstdDecompress) == "function") {
                    zlib.zstdDecompress(buffer, (err, decoded) => err ? reject(err) : resolve(decoded));
                } else {
                    reject(new Error("Zstandard encoding not supported in this Node version."));
                }
                break;
            }
            
            default: {
                resolve(buffer);
                break;
            }
        }
    });
}

function makeRequest(method, url, { headers = {}, body, timeoutMS = 60000, MAX_REDIRECTS = 10, redirectCount = 0 } = {}) {
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
                
                // handle redirection
                if ((res.statusCode >= 300) && (res.statusCode < 400) && res.headers.location) {
                    if (redirectCount >= MAX_REDIRECTS) {
                        reject(new Error(`Too many redirects (>${MAX_REDIRECTS})`));
                        return;
                    }

                    const redirectURL = new URL(res.headers.location, url).toString();

                    let newMethod = method;
                    let newBody = body;
                    let newHeaders = { ...headers };
                    if (res.statusCode == 303) {
                        newMethod = "GET";
                        newBody = undefined;
                        
                        for (const headerName of Object.keys(newHeaders)) {
                            if ((headerName.toLowerCase() == "content-length") || (headerName.toLowerCase() == "content-type")) {
                                delete newHeaders[headerName];
                            }
                        }
                    }
                    
                    makeRequest(newMethod, redirectURL, {
                        headers: newHeaders,
                        body: newBody,
                        timeoutMS,
                        MAX_REDIRECTS,
                        redirectCount: (redirectCount + 1)
                    }).then(resolve).catch(reject);
                    
                    return;
                }

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
                    
                    if (res.statusCode >= 300) {
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
