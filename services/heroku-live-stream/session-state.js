export function createInitialLiveStreamState() {
  return {
    sessionId: null,
    status: "idle",
    title: "",
    streamUrl: "",
    startedAt: null,
    updatedAt: null,
    host: null
  };
}

export function sanitizeLiveStreamTitle(value) {
  const title = String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
  return title || "Impala Live Stream";
}

export function sanitizeLiveStreamUrl(value) {
  const streamUrl = String(value || "").trim().slice(0, 2048);
  if (!streamUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(streamUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return "";
    }
    return parsedUrl.toString();
  } catch (_error) {
    return "";
  }
}

export function buildLiveStreamPayload({ enabled, state }) {
  return {
    enabled: enabled === true,
    session: {
      ...state
    }
  };
}

export function reduceLiveStreamAction(state, options = {}) {
  const action = String(options.action || "").trim().toLowerCase();
  const now = options.now || new Date().toISOString();
  const username = String(options.username || "").trim().toLowerCase() || null;

  if (action === "start") {
    const streamUrl = sanitizeLiveStreamUrl(options.streamUrl);
    if (!streamUrl) {
      return {
        ok: false,
        statusCode: 400,
        error: "Live stream URL must be a valid http or https URL."
      };
    }

    return {
      ok: true,
      statusCode: 202,
      state: {
        ...state,
        sessionId: options.sessionId || state.sessionId || "",
        status: "live",
        title: sanitizeLiveStreamTitle(options.title),
        streamUrl,
        startedAt: now,
        updatedAt: now,
        host: username
      }
    };
  }

  if (action === "stop") {
    return {
      ok: true,
      statusCode: 200,
      state: {
        ...state,
        status: "idle",
        updatedAt: now
      }
    };
  }

  if (action === "update") {
    const streamUrl = sanitizeLiveStreamUrl(options.streamUrl);
    if (options.streamUrl !== undefined && !streamUrl) {
      return {
        ok: false,
        statusCode: 400,
        error: "Live stream URL must be a valid http or https URL."
      };
    }

    return {
      ok: true,
      statusCode: 200,
      state: {
        ...state,
        title: sanitizeLiveStreamTitle(options.title),
        streamUrl: options.streamUrl === undefined ? state.streamUrl : streamUrl,
        updatedAt: now
      }
    };
  }

  return {
    ok: false,
    statusCode: 400,
    error: "Live stream action must be start, stop, or update."
  };
}
