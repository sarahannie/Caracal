// handle auth services
var jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
var atob = require('atob');
var fs = require("fs")

var JWK_URL = process.env.JWK_URL
var DISABLE_SEC = process.env.DISABLE_SEC || false
var AUD = process.env.AUD || false
var ISS = process.env.ISS || false
var EXPIRY = process.env.EXPIRY || "1d"

try {
  let prikey_path = "./key/key"
  if(fs.existsSync(prikey_path)){
    var PRIKEY = fs.readFileSync(prikey_path, 'utf8')
  }
} catch (err){
  console.error(err)
}

try {
  let pubkey_path = "./key/key.pub"
  if(fs.existsSync(pubkey_path)){
    var PUBKEY = fs.readFileSync(pubkey_path, 'utf8')
  }
} catch (err){
  console.error(err)
}


if (JWK_URL){
  var CLIENT = jwksClient({
  jwksUri: JWK_URL
});
} else {
  console.error("need JWKS URL")
  process.exit(1)
}

const getToken = function(req) {
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') { // Authorization: Bearer g1jipjgi1ifjioj
        // Handle token presented as a Bearer token in the Authorization header
    return req.headers.authorization.split(' ')[1];
    } else if (req.query && req.query.token) {
        // Handle token presented as URI param
        return req.query.token;
    } else if (req.cookies && req.cookies.token) {
        // Handle token presented as a cookie parameter
        return req.cookies.token;
    }
}

function getJwtKid(token) {
    var base64Url = token.split('.')[0];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload).kid;
};

function jwk_token_trade(jwks_client, sign_key, UserFunction){
  return function(req,res){
    var THISTOKEN = getToken(req)
    if (!THISTOKEN){
      res.status(401).send("{\"err\":\"no token found\"}")
    }
    jwks_client.getSigningKey(getJwtKid(THISTOKEN), (err,key)=>{
      console.log(key)
      if(err){
        res.status(401).send(err)
      } else {
        let use_key = key.publicKey || key.rsaPublicKey
        token_trade(use_key, sign_key, UserFunction)(req,res)
      }
    })
  }
}

// curry these calls
function token_trade(check_key, sign_key, UserFunction){
  return function(req,res){
    var THISTOKEN = getToken(req)
    let jwt_options = {}
    if (AUD){
      jwt_options.audience = AUD
    }
    if (ISS){
      jwt_options.issuer = ISS
    }
    jwt.verify(THISTOKEN, check_key, jwt_options, function(err, token){
      if (err){
        res.status(401).send(err)
      } else {
        if (!(token && (token.email || token.sub))){
          // jwt doesn't say who you are, so bye
          res.send(401).send({err:"email and sub are unset from source token"})
        } else {
          UserFunction(token).then(x=>{
            console.log(x)
            if (x===false){
              res.status(401).send({"err":"User Unauthorized"})
            } else {
              data = x
              delete data["exp"]
              // sign using the mounted key
              var token = jwt.sign(data, sign_key, {algorithm:"RS256", expiresIn: EXPIRY})
              res.send({'token':token})
            }
          }).catch(e=>{
            console.log(e)
            res.status(401).send(e)
          })
        }
      }
    })
  }
}

auth = {}
auth.jwk_token_trade = jwk_token_trade
auth.token_trade = token_trade
auth.CLIENT = CLIENT
auth.PRIKEY = PRIKEY
auth.PUBKEY = PUBKEY

module.exports = auth