import { Events, Client } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: Client) {
    console.log(`Successfully logged in as ${client.user?.tag}`);
  },
};
