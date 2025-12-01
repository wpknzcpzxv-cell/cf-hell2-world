export default {
  async fetch(request) {
    return new Response("Hello from Cloudflare Worker! 👋");
  }
};
