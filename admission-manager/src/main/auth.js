const Store = require('electron-store');
const bcrypt = require('bcryptjs');

const store = new Store({
  name: 'admission-auth',
  encryptionKey: 'adm-secure-key-2027',
});

function isPasswordSet() {
  return !!store.get('passwordHash');
}

function setPassword(plainPassword) {
  const hash = bcrypt.hashSync(plainPassword, 10);
  store.set('passwordHash', hash);
  return true;
}

function verifyPassword(plainPassword) {
  const hash = store.get('passwordHash');
  if (!hash) return false;
  return bcrypt.compareSync(plainPassword, hash);
}

function changePassword(oldPassword, newPassword) {
  if (!verifyPassword(oldPassword)) return false;
  return setPassword(newPassword);
}

module.exports = { isPasswordSet, setPassword, verifyPassword, changePassword };
