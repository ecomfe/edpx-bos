# edpx-bos

## Usage

**edp**

```bash
edp bos a.js bos://<bucket>/a.js

edp bos dir bos://<bucket>/dir
```

**api**

```javascript
var bos = require('edpx-bcs');

var ak = '';
var sk = '';
var endpoint = '';
var maxSize = 10 * 1024; // 10K
var autoUri = false;

// 上传文件
var sdk = new bos.sdk.BaiduObjectStorage(ak, sk, endpoint, maxSize, autoUri);

var def = sdk.upload(bucket, localFile);
def.done(function (url) {
    console.log(url);
});
def.fail(function (e) {
    console.error(e);
});

// 上传目录
var def = sdk.upload(bucket, localDir);
def.done(function (result) {
  /** Array.<{item: string, url: string}> */
  result.success;

  /** Array.<{item: string, error: string}>*/
  result.failure;
});

// def不会进入rejected的状态，不需要fail的处理函数.
// done.fail(function(){});
```
