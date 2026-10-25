// bun run radar:vapid > a file outside the repository, then load it into the cluster Secret together with VAPID_SUBJECT
// (mailto: or https: contact of the operator). The private key never goes into git.
const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
const publica = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
console.log(`VAPID_PUBLIC=${publica}\nVAPID_PRIVATE=${jwk.d}`);
