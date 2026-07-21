/**
 * Subscription Routes
 */

import { getSubscriptionByToken } from '../db/init.js';

export async function handleSubscription(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/sub\/([a-zA-Z0-9]+)\/?$/);
  
  if (!match) {
    return new Response('Invalid subscription link', { status: 400 });
  }
  
  const token = match[1];
  const subscription = await getSubscriptionByToken(env, token);
  
  if (!subscription) {
    return new Response('Subscription not found', { status: 404 });
  }
  
  // Check if enabled
  if (!subscription.enable) {
    return new Response('Subscription is disabled', { status: 403 });
  }
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (subscription.expire_at > 0 && subscription.expire_at < now) {
    return new Response('Subscription expired', { status: 403 });
  }
  
  // Return config links as plain text
  return new Response(subscription.config_links, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
