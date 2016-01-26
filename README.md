# edpx-bos

## Usage

**edp**

```bash
edp bos a.js bos://<bucket>/a.js

edp bos dir bos://<bucket>/dir
```

输出形如:

```bash
edp INFO endpoint url: http://bos.nj.bpc.baidu.com/<bucket>/a.js
edp INFO cdn url:      http://boscdn.bpc.baidu.com/<bucket>/a.js
```

`endpoint url`根据配置的`endpoint`直接拼接而成，重复上传后会文件内容会实时更新
`cdn url`根据OP的映射关系生成，经过cdn分配，重复上传后*不一定*会更新，也*不确定什么时候会更新*

**api**

```javascript
var bos = require('edpx-bos');

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
