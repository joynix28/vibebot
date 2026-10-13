export const ACTIONS: { key: string; name: string }[] = [
  { key: "ban", name: "Banning Members" },
  { key: "kick", name: "Kicking Members" },
  { key: "role_delete", name: "Deleting Roles" },
  { key: "role_create", name: "Creating Roles" },
  { key: "channel_delete", name: "Deleting Channels" },
  { key: "channel_create", name: "Creating Channels" },
  { key: "bot", name: "Adding Bots" },
  { key: "role_update", name: "Giving Dangerous Permissions" },
  { key: "role_add", name: "Giving Administration Roles" },
  { key: "prune", name: "Pruning Members" },
  { key: "invite", name: "Sending invite links" },
];

export const actionChoices = ACTIONS.map((a, i) => ({ name: a.name, value: i }));
