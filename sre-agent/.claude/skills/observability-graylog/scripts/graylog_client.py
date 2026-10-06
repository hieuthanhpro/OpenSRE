#!/usr/bin/env python3
"""Shared Graylog REST API client.

Supports Graylog 3.x, 4.x, and 5.x REST API for log search, stream listing,
and field terms statistics.
"""

import base64
import json
import os
import sys
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional


class GraylogClient:
    """HTTP client for Graylog REST API."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        timeout: int = 10,
    ):
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except Exception:
            pass

        # Resolve base URL from args or env
        url = (
            base_url
            or os.getenv("GRAYLOG_URL")
            or os.getenv("GRAYLOG_BASE_URL")
            or "http://localhost:9000"
        )
        url = url.rstrip("/")
        if not url.endswith("/api"):
            url = f"{url}/api"
        self.base_url = url
        self.timeout = timeout

        # Resolve credentials
        api_token = token or os.getenv("GRAYLOG_API_TOKEN") or os.getenv("GRAYLOG_TOKEN")
        user = username or os.getenv("GRAYLOG_USERNAME")
        passwd = password or os.getenv("GRAYLOG_PASSWORD")

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Requested-By": "OpenSRE-Agent",
            "Host": "graylog.onepay.vn",
        }

        if api_token:
            # Graylog token auth via Basic Auth (token as username, 'token' or 'session' as password)
            auth_str = f"{api_token}:token"
            auth_b64 = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
            headers["Authorization"] = f"Basic {auth_b64}"
        elif user and passwd:
            auth_str = f"{user}:{passwd}"
            auth_b64 = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
            headers["Authorization"] = f"Basic {auth_b64}"

        self.headers = headers

    def _request(
        self, endpoint: str, method: str = "GET", params: Optional[Dict[str, Any]] = None, data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Send HTTP request to Graylog API."""
        url = f"{self.base_url}{endpoint}"
        if params:
            query_str = urllib.parse.urlencode(
                {k: str(v) for k, v in params.items() if v is not None}
            )
            url = f"{url}?{query_str}"

        req = urllib.request.Request(url, headers=self.headers, method=method)
        if data:
            req.data = json.dumps(data).encode("utf-8")

        import ssl
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        try:
            with urllib.request.urlopen(req, timeout=self.timeout, context=ssl_ctx) as resp:
                body = resp.read().decode("utf-8")
                if not body:
                    return {}
                return json.loads(body)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            sys.stderr.write(f"Error: Graylog API HTTP {e.code}: {err_body}\n")
            raise RuntimeError(f"Graylog API request failed with HTTP {e.code}: {err_body}") from e
        except Exception as e:
            sys.stderr.write(f"Error connecting to Graylog at {url}: {e}\n")
            raise RuntimeError(f"Connection failed: {e}") from e

    def get_streams(self) -> List[Dict[str, Any]]:
        """Fetch all streams from Graylog."""
        res = self._request("/streams")
        return res.get("streams", [])

    def search_relative(
        self,
        query: str = "*",
        range_seconds: int = 3600,
        limit: int = 100,
        offset: int = 0,
        fields: Optional[List[str]] = None,
        sort: str = "timestamp:desc",
        filter_stream_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Search logs using relative time range (e.g., 3600 seconds = last 1 hour)."""
        params: Dict[str, Any] = {
            "query": query or "*",
            "range": range_seconds,
            "limit": limit,
            "offset": offset,
            "sort": sort,
        }
        if fields:
            params["fields"] = ",".join(fields)
        if filter_stream_id:
            params["filter"] = f"stream:{filter_stream_id}"

        return self._request("/search/universal/relative", params=params)

    def search_absolute(
        self,
        query: str = "*",
        from_time: str = "",
        to_time: str = "",
        limit: int = 100,
        offset: int = 0,
        fields: Optional[List[str]] = None,
        sort: str = "timestamp:desc",
        filter_stream_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Search logs using absolute ISO8601 timestamps."""
        params: Dict[str, Any] = {
            "query": query or "*",
            "from": from_time,
            "to": to_time,
            "limit": limit,
            "offset": offset,
            "sort": sort,
        }
        if fields:
            params["fields"] = ",".join(fields)
        if filter_stream_id:
            params["filter"] = f"stream:{filter_stream_id}"

        return self._request("/search/universal/absolute", params=params)

    def get_field_terms(
        self,
        field: str,
        query: str = "*",
        range_seconds: int = 3600,
        filter_stream_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get term value breakdown for a field (e.g. top sources, top log levels)."""
        params: Dict[str, Any] = {
            "field": field,
            "query": query or "*",
            "range": range_seconds,
        }
        if filter_stream_id:
            params["filter"] = f"stream:{filter_stream_id}"

        return self._request("/search/universal/relative/terms", params=params)
