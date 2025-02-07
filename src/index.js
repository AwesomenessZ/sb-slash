const { InteractionType, InteractionResponseType, InteractionResponseFlags, verifyKey } = require("discord-interactions");
const commands = ["userinfo", "skipsegments", "showoff", "segmentinfo"];
const buttons = ["lookupuser", "lookupsegment"];

// Util to send a JSON response
const jsonResponse = (obj) => new Response(JSON.stringify(obj), {
  headers: {
    "Content-Type": "application/json"
  }
});

const textResponse = (str) => new Response(str, {
  headers: {
    "Content-Type": "text/plain",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Expires": "0",
    "Surrogate-Control": "no-store"
  }
});

// Util to verify a Discord interaction is legitimate
const handleInteractionVerification = (request, bodyBuffer) => {
  const timestamp = request.headers.get("X-Signature-Timestamp") || "";
  const signature = request.headers.get("X-Signature-Ed25519") || "";
  return verifyKey(bodyBuffer, signature, timestamp, CLIENT_PUBLIC_KEY);
};

// Process a Discord interaction POST request
const handleInteraction = async ({ request, wait }) => {
  // Get the body as a buffer and as text
  const bodyBuffer = await request.arrayBuffer();
  const bodyText = (new TextDecoder("utf-8")).decode(bodyBuffer);

  // Verify a legitimate request
  if (!handleInteractionVerification(request, bodyBuffer))
    return new Response(null, { status: 401 });

  // Work with JSON body going forward
  const body = JSON.parse(bodyText);

  // Handle a PING
  if (body.type === InteractionType.PING)
    return jsonResponse({
      type: InteractionResponseType.PONG
    });
  // handle commands or buttons
  try {
    if (body.type == InteractionType.APPLICATION_COMMAND) {
      // locate command data
      const commandName = body.data.name;
      if (!commands.find((e) => e === commandName))
        return new Response(null, { status: 404 });
      // Load command
      const command = require(`./commands/${commandName}.js`);
      // Execute
      return await command.execute({ interaction: body, response: jsonResponse, wait });
    } else if (body.type == InteractionType.MESSAGE_COMPONENT) {
      // Locate button data
      const buttonName = body.data.custom_id;
      if (!buttons.find((e) => e === buttonName))
        return new Response(null, { status: 404 });
      // Load button
      const button = require(`./buttons/${buttonName}.js`);
      // Execute
      return await button.execute({ interaction: body, response: jsonResponse, wait });
    } else { // if not ping, button or message send 501
      return new Response(null, { status: 501 });
    }
  } catch (err) {
    // Catch & log any errors
    console.log(body);
    console.error(err);

    // Send an ephemeral message to the user
    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "An unexpected error occurred when executing the command.",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
};

// Process all requests to the worker
const handleRequest = async ({ request, wait }) => {
  const url = new URL(request.url);
  // Send interactions off to their own handler
  if (request.method === "POST" && url.pathname === "/interactions")
    return await handleInteraction({ request, wait });
  if (url.pathname === "/ping")
    return textResponse("pong");
  if (url.pathname === "/version")
    return textResponse(VERSION.substring(0,7));
  if (url.pathname === "/invite")
    return new Response(null, {
      status: 301,
      headers: {
        "Location": `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=applications.commands`
      }
    });
  if (url.pathname === "/")
    return new Response(null, {
      status: 301,
      headers: {
        "Location": "https://github.com/mchangrh/sb-slash#readme"
      }
    });
  return new Response(null, { status: 404 });
};

// Register the worker listener
addEventListener("fetch", (event) => {
  // Process the event
  return event.respondWith(handleRequest({
    request: event.request,
    wait: event.waitUntil.bind(event)
  }).catch((err) => {
    // Log & re-throw any errors
    console.error(err);
    throw err;
  }));
});
