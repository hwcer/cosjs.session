/**
 * config:session配置
 * config.lock 用户进程锁, 默认:false(关闭),格式:[num,ms,reload],
 * config.lock = [10,500,1]
 * 仅当在session存放用户cache时才有必要将reload设置为 true
 *
 */
"use strict";
//const onFinished            = require('on-finished')
const cosjs_lib             = require('cosjs.library');
const cosjs_redis           = require('cosjs.redis').hash;
const cosjs_format          = cosjs_lib.require('format').parse;
const cosjs_crypto          = require('./crypto');
const cosjs_promise         = cosjs_lib.require('promise');


const SESSION_KEY    = '$access';
const SESSION_LOCK   = '$locked';
const SESSION_TIME   = '$expire';

module.exports = function(handle,opts){
    return new session(handle,opts);
}

module.exports.config = require("./config")

function session(handle,opts) {
    this.sid       = '';    //session id
    this.uid       = '';    // user id
    this._locked   = 0;
    this._upsert   = new Set();
    this._dataset  = null;       //session 数据
    //权限
    if(typeof opts['level'] === 'function'){
        this.level = opts['level'].call(handle);
    }
    else{
        this.level = parseInt(opts['level']);
    }
    Object.defineProperty(this,'opts',{ value: opts, writable: false, enumerable: false, configurable: false,});
    //启动session
    this.start = function(){
        if( !this.redis ) {
            let _redis_opts = (typeof opts.redis === 'function') ? opts.redis.call(handle) : opts.redis;
            if (!_redis_opts) {
                return cosjs_promise.callback("SessionError", "redis empty");
            }
            let _redis_format = opts["format"] || {};
            _redis_format[SESSION_KEY] = {"type": "string", "value": ""}
            _redis_format[SESSION_LOCK] = {"type": "number", "value": 0}
            _redis_format[SESSION_TIME] = {"type": "number", "value": 0}
            let _redis_hash = new cosjs_redis(_redis_opts, opts.prefix, _redis_format);
            _redis_hash.unique = 0; //非单例模式
            Object.defineProperty(this, 'redis', {  value: _redis_hash, writable: false, enumerable: true, configurable: false, });
            //事件监听
            //onFinished(handle.res, (err, res)=>{ session_unlock.call(this);  })
        }
        this.sid = arguments[0] || handle.get(opts["key"],"string",opts["method"]);
        if(this.sid){
            this.uid = cosjs_crypto.decode(opts.secret,this.sid);
        }

        if(this.level < 1){
            return cosjs_promise.callback(null);
        }

        if( !this.sid ){
            return cosjs_promise.callback('logout','session id[' + opts["key"] + '] empty');
        }

        if( !this.uid ){
            return cosjs_promise.callback('logout','sid error');
        }
        return session_start.call(this);
    }
    //关闭SESSION
    this.close = function () {
        return session_close.call(this);
    }
    //创建session,登录时使用:uid,data
    this.create = function(uid,data){
        this.sid = cosjs_crypto.encode(opts.secret,uid);
        this.uid = uid;

        let newData = Object.assign({},data);
        newData[SESSION_KEY]  = this.sid;
        this.redis.multi();
        this.redis.set(this.uid,newData);
        if(this.opts.expire){
            this.redis.expire(this.uid,this.opts.expire);
        }
        return this.redis.save().then(()=>{
            if( !this.opts.method || ["cookie","all"].indexOf(this.opts.method) >=0 ){
                handle.res.cookie(this.opts.key, this.sid, {});
            }
            this._locked = 1;
            return this.sid;
        })
    }
}

//获取一个或者多个在session中缓存的信息
session.prototype.get = function (key, type) {
    if(!this._dataset || !(key in this._dataset) ){
        return null;
    }
    let val = this._dataset[key];
    if(type){
        val = cosjs_format(val,type);
    }
    return val;
};
//写入数据，不会修改session,可用于临时缓存
session.prototype.set = function (key, val) {
    if(!this.uid){
        return false;
    }
    if(typeof key === "object"){
        for(let k in key){
            let v = key[k];
            this._dataset[k] = v;
            this._upsert.add(k);
        }
    }
    else{
        this._upsert.add(key);
        this._dataset[key] = val;
    }
};
//删除一个或者多个在session中缓存的信息，keys==null,删除所有信息，退出登录
session.prototype.del = function(key){
    if(!this.uid){
        return cosjs_promise.callback(null);
    }
    else{
        return this.redis.del(this.uid,key);
    }
}



function session_start() {
    return this.redis.get(this.uid).then(ret=>{
        if (!ret) {
            return cosjs_promise.callback('logout', 'session not exist');
        }
        this._dataset = ret;
        if ( !ret[SESSION_KEY] || this.sid !== ret[SESSION_KEY]) {
            return cosjs_promise.callback("logout", "session id illegal");
        }
        if(ret[SESSION_LOCK] > 0){
            return ret[SESSION_LOCK] + 1;
        }
        else{
            return this.redis.incr(this.uid,SESSION_LOCK,1);
        }
    }).then(ret=>{
        if(ret > 1){
            return cosjs_promise.callback("locked",ret);
        }
        this._locked = 1;
    })
}

function session_close(){
    if(!this._locked){
        return;
    }
    let upsert = {};
    upsert[SESSION_LOCK] = 0;
    if(this.opts.expire){
        upsert[SESSION_TIME] = Date.now();
    }
    if(this._upsert.size > 0){
        for(let k of this._upsert){
            upsert[k] = this._dataset[k]||'';
        }
        this._upsert.clear();
    }
    return Promise.resolve().then(()=>{
        return this.redis.set(this.uid,upsert);
    }).then(()=>{
        if(!this.opts.expire){
            return ;
        }
        let ttl = upsert[SESSION_TIME] - this.get(SESSION_TIME);
        let min = this.opts.expire / 3 * 1000;
        if( ttl < min ){
            return this.redis.expire(this.uid,this.opts.expire);
        }
    }).catch(err=>{
        cosjs_lib('debug','session close',err);
    })
}