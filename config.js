
"use strict";

module.exports = {
    key     : "_sid",                             //session id key
    method  : "cookie",                          //session id 存储方式,get,post,path,cookie
    level  : 1,                                 //安全等级，start,0:不验证,1:基本验证,2:基本验证+进程锁
    redis  : null,                              //redis options || poll
    secret : 'NS8VkYH6vDMVjG5j',                  //加密字符串
    prefix : "session",                        //session hash 前缀
    expire : 86400,                             //有效期,S
}