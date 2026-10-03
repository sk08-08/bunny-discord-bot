import {
  Events,
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

async function getSpotifyToken() {
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  return data.access_token;
}

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message: Message) {
    // Ignore messages from other bots
    if (message.author.bot) return;

    // Tell TypeScript this channel strictly supports sending messages
    if (!message.channel.isSendable()) return;

    const spotifyRegex =
      /https:\/\/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
    const match = message.content.match(spotifyRegex);

    if (match) {
      const playlistId = match[1];
      const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;

      // UX Improvement: Show typing indicator while fetching data
      await message.channel.sendTyping();

      try {
        let embed = new EmbedBuilder().setColor("#1DB954");
        let apiSuccess = false;
        let dynamicTitle = "Spotify Playlist";

        // Attempt 1: Official API (Requires Premium account on Developer Dashboard)
        try {
          const token = await getSpotifyToken();
          const response = await fetch(
            `https://api.spotify.com/v1/playlists/${playlistId}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          if (response.ok) {
            const playlist = await response.json();
            dynamicTitle = playlist.name;

            embed
              .setTitle(`🎧 ${playlist.name}`)
              .setURL(playlist.external_urls.spotify)
              .setAuthor({
                name: `Curated by ${playlist.owner.display_name}`,
                iconURL:
                  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/2048px-Spotify_logo_without_text.svg.png",
              })
              .setDescription(
                `*${playlist.description || "Dive into this selection. Click the button below to start listening."}*`,
              )
              .setImage(playlist.images[0]?.url)
              .addFields({
                name: "Tracks",
                value: `${playlist.tracks.total}`,
                inline: true,
              });
            apiSuccess = true;
          } else {
            console.log(
              `Official API blocked (${response.status}). Activating OEmbed fallback...`,
            );
          }
        } catch (apiError) {
          console.log(
            "Error connecting to the Official API. Activating OEmbed fallback...",
          );
        }

        // Attempt 2: OEmbed Fallback (Public and Free)
        if (!apiSuccess) {
          const oembedResponse = await fetch(
            `https://open.spotify.com/oembed?url=${playlistUrl}`,
          );

          if (!oembedResponse.ok) {
            console.error("OEmbed fallback failed. Aborting.");
            return;
          }

          const oembedData = await oembedResponse.json();
          dynamicTitle = oembedData.title;

          embed
            .setTitle(`🎧 ${oembedData.title}`)
            .setURL(playlistUrl)
            .setAuthor({
              name: "Spotify Playlist",
              iconURL: "https://i.imgur.com/qI9tQzi.png",
            })
            .setDescription(
              "*Dive into this selection. Click the buttons below to start listening.*",
            )
            .setImage(oembedData.thumbnail_url);
        }

        // Common elements: Footer and Timestamp
        embed
          .setFooter({
            text: `Shared by ${message.author.username}`,
            iconURL: message.author.displayAvatarURL(),
          })
          .setTimestamp();

        // Interactive Buttons
        const spotifyButton = new ButtonBuilder()
          .setLabel("Open in Spotify")
          .setURL(playlistUrl)
          .setStyle(ButtonStyle.Link);

        const youtubeButton = new ButtonBuilder()
          .setLabel("Find on YouTube")
          .setURL(
            `https://www.youtube.com/results?search_query=${encodeURIComponent(dynamicTitle + " playlist")}`,
          )
          .setStyle(ButtonStyle.Link);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          spotifyButton,
          youtubeButton,
        );

        // Send the new rich embed directly to the channel
        await message.channel.send({ embeds: [embed], components: [row] });

        // Safely delete the original user message to keep the channel clean
        try {
          await message.delete();
        } catch (deleteError) {
          console.log(
            "Could not delete the original message. Missing 'Manage Messages' permission.",
          );
        }
      } catch (error) {
        console.error("General error processing the playlist:", error);
      }
    }
  },
};
