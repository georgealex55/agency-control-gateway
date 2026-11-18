#!/usr/bin/env node
/**
 * REACH encrypted SQLite backup helper. Synthetic QA only.
 * The application writes a CONSISTENT SQLite VACUUM INTO backup first.
 * This helper encrypts that snapshot + the instance secret/key material
 * using scrypt + AES-256-GCM, then validates and restores to a fresh volume.
 */
import assert from 'node:assert/strict';
import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const mode=process.argv[2],root=resolve(process.argv[3]||'/source'),dest=resolve(process.argv[4]||'/restore');
const archive=join(root,'reach-synthetic-backup.aesgcm');
const pass=process.env.REACH_BACKUP_PASSPHRASE;
assert(pass && pass.length>=24,'test-only random backup passphrase required');
const MAGIC=Buffer.from('REACH-SQLITE-01', 'ascii');
const params={N:32768,r:8,p:1,maxmem:64*1024*1024};
const key=(salt,password=pass)=>scryptSync(password,salt,32,params);
const readOptional=f=>existsSync(join(root,f))?readFileSync(join(root,f)).toString('base64'):null;
function encrypt(plain){
 const salt=randomBytes(16),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key(salt),iv);
 const payload=Buffer.concat([cipher.update(plain),cipher.final()]);
 const tag=cipher.getAuthTag();
 return Buffer.concat([MAGIC,salt,iv,tag,payload]);
}
function decrypt(bundle,password=pass){
 assert(bundle.length>MAGIC.length+44,'truncated backup');
 assert(bundle.subarray(0,MAGIC.length).equals(MAGIC),'bad magic/version');
 const start=MAGIC.length;
 const salt=bundle.subarray(start,start+16),iv=bundle.subarray(start+16,start+28);
 const tag=bundle.subarray(start+28,start+44);
 const decipher=createDecipheriv('aes-256-gcm',key(salt,password),iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(bundle.subarray(start+44)),decipher.final()]);
}
function source(){
 assert(existsSync(join(root,'reach-backup-source.json')),'QA manifest missing');
 return JSON.parse(readFileSync(join(root,'reach-backup-source.json'),'utf8'));
}
function validSqlite(bytes,label){
 assert.equal(bytes.subarray(0,16).toString('ascii'),'SQLite format 3\u0000',label+' SQLite header');
 // A separate on-disk copy is checked before replacing a restorable database.
 mkdirSync(dest,{recursive:true});
 const testDb=join(dest,'.reach-validate.db');
 writeFileSync(testDb,bytes,{mode:0o600});
 try{
   const handle=new DatabaseSync(testDb);
   try{
     assert.equal(handle.prepare('PRAGMA integrity_check').get().integrity_check,'ok',label+' integrity');
     const found=handle.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('users','contacts','workflows','workflow_runs')").get().n;
     assert.equal(found,4,label+' key schema');
   }finally{handle.close();}
 }finally{rmSync(testDb,{force:true});}
}
function encryptSource(){
 const manifest=source();
 const backup=join(root,'backups',manifest.backupName);
 assert(existsSync(backup),'must use built-in consistent backup snapshot, not live DB file');
 const dbBytes=readFileSync(backup);
 validSqlite(dbBytes,'source backup');
 const contents={format:'reach-sqlite-with-instance-keys',version:1,
   saved_at:new Date().toISOString(),manifest,
   database:dbBytes.toString('base64'),
   instance_secret:readOptional('secret'),
   data_key:readOptional('data.key'),
   previous_data_key:readOptional('data.key.previous')};
 const plain=Buffer.from(JSON.stringify(contents));
 const ciphertext=encrypt(plain);
 writeFileSync(archive,ciphertext,{mode:0o600});
 assert(!ciphertext.includes(Buffer.from('SQLite format 3')),'archive must not expose plaintext SQLite header');
 assert.equal(decrypt(ciphertext).equals(plain),true,'backup self-roundtrip');
 // The explicitly exported plaintext copy is removed after encryption succeeds;
 // the normal running instance database remains plaintext as GoHyperLevel expects.
 rmSync(backup,{force:true});
 console.log(JSON.stringify({stage:'encrypted',archiveBytes:ciphertext.length,
   plainBytes:plain.length,magic:MAGIC.toString(),snapshotDeleted:true,auth:'AES-256-GCM'}));
}
function restore(){
 const bundle=readFileSync(archive);
 // Negative authentication tests MUST fail without writing a restored database.
 assert.throws(()=>decrypt(bundle,'incorrect-passphrase-for-negative-test'),/authenticate|Unsupported state|bad decrypt|auth/i,
   'wrong key must fail');
 const tampered=Buffer.from(bundle);
 tampered[tampered.length-5]^=0x55;
 assert.throws(()=>decrypt(tampered),/authenticate|Unsupported state|bad decrypt|auth/i,
   'altered ciphertext must fail');
 const decrypted=decrypt(bundle);
 const data=JSON.parse(decrypted.toString('utf8'));
 assert.equal(data.format,'reach-sqlite-with-instance-keys');
 assert.equal(data.version,1);
 const bytes=Buffer.from(data.database,'base64');
 validSqlite(bytes,'restored backup');
 // Everything has been authenticated and integrity-checked before writes.
 mkdirSync(dest,{recursive:true});
 const temporary=join(dest,'pghl.db.tmp');
 writeFileSync(temporary,bytes,{mode:0o600});
 renameSync(temporary,join(dest,'pghl.db'));
 for(const [file,base64] of [
   ['secret',data.instance_secret],['data.key',data.data_key],
   ['data.key.previous',data.previous_data_key]
 ]){
   if(base64!==null)writeFileSync(join(dest,file),Buffer.from(base64,'base64'),{mode:0o600});
 }
 writeFileSync(join(dest,'reach-backup-source.json'),JSON.stringify(data.manifest,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({stage:'restored',integrity:'ok',wrongPassword:'rejected',tamper:'rejected',
   restoredBytes:bytes.length,credentialsPreserved:true,archiveOnlyWasEncrypted:true}));
}
if(mode==='encrypt')encryptSource();
else if(mode==='restore')restore();
else throw Error('mode must be encrypt or restore');
