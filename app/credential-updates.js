'use strict';

async function syncOptionalCredential(account, value, saveCredential, deleteCredential) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  if (normalizedValue) {
    await saveCredential(account, normalizedValue);
    return true;
  }

  await deleteCredential(account);
  return false;
}

module.exports = { syncOptionalCredential };