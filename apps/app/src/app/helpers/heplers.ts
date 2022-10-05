
export function cleanOtherContacts(contacts: Record<string, any>) {
  const names = Object.keys(contacts);
  return names.reduce((acc, curr) => ({ ...acc, [curr]: { joined: false, stream: null } }), {})
}
