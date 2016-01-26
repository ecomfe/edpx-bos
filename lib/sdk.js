/**
 * @file bos sdk
 * @author leeight(liyubei@baidu.com)
 * @author wangyisheng@baidu.com (wangyisheng)
 **/

var edp = require('edp-core');
var mime = require('mime');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var BosClient = require('baidubce-sdk').BosClient;

var CDN_ENDPOINT_MAP = {
    // 北京3副本集群
    'http://bos.bj.bpc-internal.baidu.com': 'http://bosbjcdn.bpc.baidu.com',
    'http://bos.bj.bpc.baidu.com': 'http://bosbjcdn.bpc.baidu.com',

    // 南京3副本集群
    'http://bos.nj.bpc-internal.baidu.com': 'http://boscdn.bpc.baidu.com',
    'http://bos.nj.bpc.baidu.com': 'http://boscdn.bpc.baidu.com',

    // 北京1.5副本集群
    'http://bos.bj.rbs-internal.baidu.com': 'http://bjboscdn.bpc.baidu.com',
    'http://bos.bj.rbs.baidu.com': 'http://bjboscdn.bpc.baidu.com',

    // 南京1.5副本集群
    'http://bos.nj.rbs-internal.baidu.com': 'http://njboscdn.bpc.baidu.com',
    'http://bos.nj.rbs.baidu.com': 'http://njboscdn.bpc.baidu.com'
};

/**
 * 构造器
 *
 * @constructor
 * @param {string} ak The AccessKey.
 * @param {string} sk The SecretKey.
 * @param {string} endpoint bos endpoint
 * @param {number} maxSize The max file size.
 * @param {boolean=} autoUri 是否自动添加md5的后缀.
 */
function BaiduObjectStorage(ak, sk, endpoint, maxSize, autoUri) {
    this.ak = ak;
    this.sk = sk;
    this.endpoint = endpoint;
    this.maxSize = maxSize;
    this.autoUri = !!autoUri;
    this.client = new BosClient({
        credentials: {
            ak: ak,
            sk: sk
        },
        endpoint: endpoint
    });
}

/**
 * 获取文件名（如果autouri激活则返回处理后的文件名）
 *
 * @private
 * @param {string} localFile 文件路径
 * @return {string} 文件名
 */
BaiduObjectStorage.prototype.getBaseName = function (localFile) {
    if (this.autoUri) {
        var basename = path.basename(localFile);
        var extname = path.extname(basename);

        var md5sum = crypto.createHash('md5');
        md5sum.update(fs.readFileSync(localFile));
        return basename.replace(extname, '') + '-' + md5sum.digest('hex').substring(0, 8) + extname;
    }

    return path.basename(localFile);
};

/**
 * 获取cdn域名
 *
 * @private
 * @param {string} endpoint endpoint
 * @return {string} cdn endpoint
 */
BaiduObjectStorage.prototype.getCdnEndpoint = function (endpoint) {
    return CDN_ENDPOINT_MAP[endpoint] || endpoint;
};

/**
 * 获取完整后缀路径（除bucket外）
 *
 * @param {string} localFile 文件路径
 * @param {string=} prefix 最终路径中追加在文件名之前的前缀
 * @return {string} 完整路径
 */
BaiduObjectStorage.prototype._getObjectName = function (localFile, prefix) {
    var stat = fs.statSync(localFile);

    var objectName;

    if (prefix) {
        if (stat.isFile()) {
            var ext = path.extname(localFile);
            if (ext && ext === path.extname(prefix)) {
                // edp bos lib/bos.js bs://adtest/hello/world/my-bos.js
                // objectName = '/my-bos.js' or something like '/my-bos-da717507.js' when auto-uri is true
                var localFileName = path.basename(localFile, path.extname(localFile));
                var prefixFileName = path.basename(prefix, path.extname(prefix));
                var basename = this.getBaseName(localFile);
                basename = basename.replace(localFileName, prefixFileName);
                objectName = '/' + path.dirname(prefix) + '/' + basename;
            }
            else {
                // edp bos lib/bos.js bs://adtest/hello/world
                // objectName = '/hello/world/bos.js'
                objectName = '/' + prefix + '/' + this.getBaseName(localFile);
            }
        }
    }
    else {
        objectName = '/' + this.getBaseName(localFile);
    }

    return objectName.replace(/\/+/g, '/');
};

/**
 * 批量上传多个文件，不应该一次发起太多的请求，否则可能会挂掉
 *
 * @param {string} bucketName Bucket name.
 * @param {string} dir 文件所处的目录.
 * @param {Array.<string>} files 文件列表.
 * @param {string} prefix 上传路径的前缀.
 * @return {Object} Deferred对象
 */
BaiduObjectStorage.prototype._batchUpload = function (bucketName, dir, files, prefix) {
    var d = new edp.Deferred();

    var me = this;
    var activeCount = 0;

    var success = [];
    var failure = [];

    function startTask() {
        if (!files.length) {
            if (activeCount <= 0) {
                d.resolve({
                    success: success,
                    failure: failure
                });
            }
            return;
        }

        var item = files.pop();
        var def = me.upload(bucketName,
            path.join(dir, item),
            path.join(prefix, item));

        activeCount++;
        def.ensure(function () {
            activeCount--;
        });
        def.done(function (url) {
            if (typeof url === 'object'
                && Array.isArray(url.success)
                && Array.isArray(url.failure)) {
                success = success.concat(url.success);
                failure = failure.concat(url.failure);
            }
            else {
                success.push({
                    item: path.join(dir, item),
                    url: url
                });
            }
            startTask();
        });
        def.fail(function (e) {
            failure.push({
                item: path.join(dir, item),
                error: e.toString()
            });
            startTask();
        });
    }

    // 并发5个请求
    var max = Math.min(5, files.length);
    for (var i = 0; i < max; i++) {
        startTask();
    }

    return d;
};

BaiduObjectStorage.prototype.upload = function (bucketName, localFile, prefix) {
    var stat = fs.statSync(localFile);

    prefix = prefix || '';

    var def = new edp.Deferred();

    if (stat.isDirectory()) {
        var files = fs.readdirSync(localFile).filter(function (item) {
            return (item.indexOf('.') !== 0 && item !== 'CVS');
        });
        return this._batchUpload(bucketName, localFile, files, prefix);
    }
    else if (stat.isFile()) {
        if (stat.size > this.maxSize) {
            edp.log.error('%s size = [%s], maxSize = [%s], ignore it.',
                localFile, stat.size, this.maxSize);
            def.reject('File size [' + stat.size + '] is larger than the maximum [' + this.maxSize + ']');
            return def;
        }
    }

    var objectName = this._getObjectName(localFile, prefix);
    objectName = objectName.replace(/\\+/g, '/');

    var realUploadDef = this.realUpload(localFile, bucketName, objectName);
    realUploadDef.done(function (url) {
        def.resolve(url);
    });
    realUploadDef.fail(function (e) {
        def.reject(e);
    });

    return def;
};

/**
 * 实际上传方法
 *
 * @param {string} localFile 上传文件的路径
 * @param {string} bucketName The Bucket Name
 * @param {string=} objectName the Object Name
 *
 * @return {edp.Deferred}
 */
BaiduObjectStorage.prototype.realUpload = function (localFile, bucketName, objectName) {
    var me = this;
    var data = fs.readFileSync(localFile);
    var def = new edp.Deferred();

    objectName = '/' + objectName;
    objectName = objectName.replace(/\/+/g, '/');

    this.client.putObject(bucketName, objectName, data, {
        'Content-Type': mime.lookup(objectName)
    }).then(function () {
        var bosUrl = me.endpoint + '/' + bucketName + objectName;
        var cdnUrl = me.getCdnEndpoint(me.endpoint) + '/' + bucketName + objectName;
        edp.log.info('endpoint url: \t' + bosUrl);
        edp.log.info('cdn url: \t' + cdnUrl);
        def.resolve(bosUrl);
    }).fail(function () {
        edp.log.fatal('file: %s upload failed', localFile);
        def.reject(localFile);
    });

    return def;
};

exports.BaiduObjectStorage = BaiduObjectStorage;
