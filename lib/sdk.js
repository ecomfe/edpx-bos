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

/* jshint camelcase: false */

/**
 * @constructor
 * @param {string} ak The AccessKey.
 * @param {string} sk The SecretKey.
 * @param {string} endpoint bos endpoint
 * @param {number} maxSize The max file size.
 * @param {boolean=} opt_autoUri 是否自动添加md5的后缀.
 */
function BaiduObjectStorage(ak, sk, endpoint, maxSize, opt_autoUri) {
    this.ak = ak;
    this.sk = sk;
    this.endpoint = endpoint;
    this.maxSize = maxSize;
    this.autoUri = !!opt_autoUri;
    this.client = new BosClient({
        credentials: {
            ak: ak,
            sk: sk
        },
        endpoint: endpoint
    });
}

/**
 * @return {string}
 */
BaiduObjectStorage.prototype._getBaseName = function (localFile) {

    if (this.autoUri) {
        var basename = path.basename(localFile);
        var extname = path.extname(basename);

        var md5sum = crypto.createHash('md5');
        md5sum.update(fs.readFileSync(localFile));
        return basename.replace(extname, '') + '-' +
            md5sum.digest('hex').substring(0, 8) + extname;
    } else {
        return path.basename(localFile);
    }
};

/**
 * @param {string} localFile The local file path.
 * @param {string=} opt_prefix The target prefix path.
 */
BaiduObjectStorage.prototype._getObjectName = function (localFile, opt_prefix) {
    var stat = fs.statSync(localFile);

    var objectName;

    if (opt_prefix) {
        if (stat.isFile()) {
            var ext = path.extname(localFile);
            if (ext && ext == path.extname(opt_prefix)) {
                // edp bcs lib/bcs.js bs://adtest/hello/world/my-bcs.js
                // objectName = '/my-bcs.js' or something like '/my-bcs-da717507.js' when auto-uri is true
                var localFileName = path.basename(localFile, path.extname(localFile));
                var prefixFileName = path.basename(opt_prefix, path.extname(opt_prefix));
                var basename = this._getBaseName(localFile);
                basename = basename.replace(localFileName, prefixFileName);
                objectName = '/' + path.dirname(opt_prefix) + '/' + basename;
            }
            else {
                // edp bcs lib/bcs.js bs://adtest/hello/world
                // objectName = '/hello/world/bcs.js'
                objectName = '/' + opt_prefix + '/' + this._getBaseName(localFile);
            }
        }
    }
    else {
        objectName = '/' + this._getBaseName(localFile);
    }

    return objectName.replace(/\/+/g, '/');
};

/**
 * 批量上传多个文件，不应该一次发起太多的请求，否则可能会挂掉
 * @param {string} bucketName Bucket name.
 * @param {string} dir 文件所处的目录.
 * @param {Array.<string>} files 文件列表.
 * @param {string} prefix 上传路径的前缀.
 *
 * @return {er.Deferred}
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
        activeCount ++;
        def.ensure(function (){ activeCount --; });
        def.done(function (url) {
            if (typeof url === 'object' &&
                 Array.isArray(url.success) &&
                 Array.isArray(url.failure)) {
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
        def.fail(function (e){
            failure.push({
                item: path.join(dir, item),
                error: e.toString()
            });
            startTask();
        });
    }

    // 并发5个请求
    var max = Math.min(5, files.length);
    for (var i = 0; i < max; i ++) {
        startTask();
    }

    return d;
};

BaiduObjectStorage.prototype.upload = function (bucketName, localFile, opt_prefix) {
    var stat = fs.statSync(localFile);

    var prefix = opt_prefix || '';

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
            def.reject('File size [' + stat.size +
                '] is larger than the maximum [' + this.maxSize + ']');
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
        edp.log.info(bosUrl);
        def.resolve(bosUrl);
    }).fail(function () {
        edp.log.fatal('file: %s upload failed', localFile);
        def.reject(localFile);
    });

    return def;
};

exports.BaiduObjectStorage = BaiduObjectStorage;
