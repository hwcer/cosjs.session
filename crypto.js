"use strict";
const crypto = require('crypto');
const garbled = 4;
const cipherType = 'aes-128-cfb';


exports.encode = function sessionEncode(secret,str){
    let iv = randomString(garbled);
    let cipher  = crypto.createCipheriv(cipherType,verifySecret(secret),verifySecret(iv));
    let encStr  = cipher.update(str, "utf8", "hex");
    encStr += cipher.final("hex");
    return iv + encStr.toString();
}

exports.decode =  function sessionDecode(secret,str){
    str = String(str);
    let newStr,decrypted,iv;
    iv = str.substr(0,garbled);
    newStr = str.substr(garbled);
    try {
        let decipher = crypto.createDecipheriv(cipherType, verifySecret(secret),verifySecret(iv));
        decrypted = decipher.update(newStr, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
    }
    catch (e){
        decrypted = null;
    }
    return decrypted;
}

function randomString(len) {
    len = len || 10;
    let $chars = "abcdefghijklmnopqrstuvwxyz1234567890";
    let maxPos = $chars.length;
    let pwd = '';
    for (let i = 0; i < len; i++) {
        pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
    }
    return pwd;
}

//秘钥检查，新版本NODE要求秘钥必须为16位
function verifySecret() {
    let secret = String(arguments[0]);
    if(secret.length >= 16){
        return secret.substring(0,16);
    }
    else{
        return secret.padEnd(16);
    }
}