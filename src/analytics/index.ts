// ---------------------------------------------------------------------------
// Analytics — script generation for common providers
// ---------------------------------------------------------------------------
// Returns HTML script tags as strings. Framework-agnostic — inject
// into your <head> however your framework supports it.
// ---------------------------------------------------------------------------

export type AnalyticsProvider = "posthog" | "google" | "plausible";

export interface AnalyticsConfig {
  provider: AnalyticsProvider;
  id: string;
}

/** Validation patterns for analytics IDs to prevent XSS injection */
export const ANALYTICS_ID_PATTERNS: Record<string, RegExp> = {
  google: /^G-[A-Z0-9]+$/i,
  posthog: /^phc_[a-zA-Z0-9]+$/,
  plausible: /^[a-zA-Z0-9._-]+$/,
};

/**
 * Validate an analytics ID against its provider's expected format.
 */
export function isValidAnalyticsId(
  provider: AnalyticsProvider,
  id: string,
): boolean {
  const pattern = ANALYTICS_ID_PATTERNS[provider];
  return pattern ? pattern.test(id) : false;
}

/**
 * Generate the analytics script HTML for a provider.
 * Returns null if the ID fails format validation (XSS prevention).
 *
 * @example
 * const script = getAnalyticsScript({ provider: "posthog", id: "phc_xxxxx" });
 * // Inject into <head>: <Fragment set:html={script} />
 */
export function getAnalyticsScript(config: AnalyticsConfig): string | null {
  if (!isValidAnalyticsId(config.provider, config.id)) {
    console.warn(
      `[whop-kit] Invalid ${config.provider} analytics ID format: ${config.id}`,
    );
    return null;
  }

  switch (config.provider) {
    case "google":
      return `<script async src="https://www.googletagmanager.com/gtag/js?id=${config.id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${config.id}')</script>`;

    case "posthog":
      return `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group setPersonProperties resetPersonProperties setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags startSessionRecording stopSessionRecording sessionRecordingStarted loadToolbar get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSurvey getSurvey getActiveMatchingSurveys renderSurvey canRenderSurvey".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('${config.id}',{api_host:'https://us.i.posthog.com',person_profiles:'identified_only'})</script>`;

    case "plausible":
      return `<script defer data-domain="${config.id}" src="https://plausible.io/js/script.js"></script>`;

    default:
      return null;
  }
}
