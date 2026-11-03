const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const file=path.join(__dirname,'.local-admin.json');
if(fs.existsSync(file)){console.log('Account already exists. Use the credentials created on first run.');process.exit(0);}
const password=crypto.randomBytes(12).toString('base64url'),salt=crypto.randomBytes(16).toString('hex');
fs.writeFileSync(file,JSON.stringify({username:'admin',salt,hash:crypto.scryptSync(password,salt,64).toString('hex')},null,2),{mode:0o600});
console.log('\nInitial username: admin\nInitial password: '+password+'\nSave this password now. It will not be printed again.\n');
