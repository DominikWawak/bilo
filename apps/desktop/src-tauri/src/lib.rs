use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
  fs,
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::Mutex,
  time::{SystemTime, UNIX_EPOCH},
};
// serde_json::json used in organize_note_with_runtime and acp_query

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeConfig {
  llama_binary_path: String,
  whisper_binary_path: String,
  llama_model_path: String,
  whisper_model_path: String,
  context_size: u32,
  threads: u32,
  gpu_layers: u32,
  host: String,
  port: u16,
}

impl Default for RuntimeConfig {
  fn default() -> Self {
    Self {
      llama_binary_path: "llama-server".to_string(),
      whisper_binary_path: "whisper-stream".to_string(),
      llama_model_path: "models/llama-3.1-8b-instruct-q4_k_m.gguf".to_string(),
      whisper_model_path: "models/ggml-base.en.bin".to_string(),
      context_size: 4096,
      threads: 6,
      gpu_layers: 99,
      host: "127.0.0.1".to_string(),
      port: 8088,
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStatus {
  llama_running: bool,
  whisper_running: bool,
  last_error: Option<String>,
}

fn resolve_worklog_path(date_key: &str, output_dir: &str) -> Result<PathBuf, String> {
  let parts = date_key.split('-').collect::<Vec<_>>();
  if parts.len() != 3 {
    return Err("dateKey must be YYYY-MM-DD".to_string());
  }

  let year = parts[0];
  let month = parts[1];
  let day = parts[2];

  if year.len() != 4 || month.len() != 2 || day.len() != 2 {
    return Err("dateKey must be YYYY-MM-DD".to_string());
  }
  if !year.chars().all(|c| c.is_ascii_digit())
    || !month.chars().all(|c| c.is_ascii_digit())
    || !day.chars().all(|c| c.is_ascii_digit())
  {
    return Err("dateKey must contain digits only".to_string());
  }

  let mut output = PathBuf::from(output_dir);
  output.push(year);
  output.push(month);
  fs::create_dir_all(&output).map_err(|e| format!("worklog directory create failed: {e}"))?;

  output.push(format!("{day}.md"));
  Ok(output)
}

#[derive(Default)]
struct RuntimeManager {
  config: RuntimeConfig,
  llama_child: Option<Child>,
  whisper_child: Option<Child>,
  last_error: Option<String>,
}

impl RuntimeManager {
  fn refresh(&mut self) {
    if let Some(child) = self.llama_child.as_mut() {
      if child.try_wait().ok().flatten().is_some() {
        self.llama_child = None;
      }
    }

    if let Some(child) = self.whisper_child.as_mut() {
      if child.try_wait().ok().flatten().is_some() {
        self.whisper_child = None;
      }
    }
  }

  fn status(&mut self) -> RuntimeStatus {
    self.refresh();
    RuntimeStatus {
      llama_running: self.llama_child.is_some(),
      whisper_running: self.whisper_child.is_some(),
      last_error: self.last_error.clone(),
    }
  }
}

#[tauri::command]
fn get_runtime_config(state: tauri::State<'_, Mutex<RuntimeManager>>) -> Result<RuntimeConfig, String> {
  let manager = state.lock().map_err(|e| e.to_string())?;
  Ok(manager.config.clone())
}

#[tauri::command]
fn set_runtime_config(
  config: RuntimeConfig,
  state: tauri::State<'_, Mutex<RuntimeManager>>,
) -> Result<RuntimeConfig, String> {
  let mut manager = state.lock().map_err(|e| e.to_string())?;
  manager.config = config.clone();
  Ok(config)
}

#[tauri::command]
fn get_runtime_status(state: tauri::State<'_, Mutex<RuntimeManager>>) -> Result<RuntimeStatus, String> {
  let mut manager = state.lock().map_err(|e| e.to_string())?;
  Ok(manager.status())
}

#[tauri::command]
fn start_llama(state: tauri::State<'_, Mutex<RuntimeManager>>) -> Result<RuntimeStatus, String> {
  let mut manager = state.lock().map_err(|e| e.to_string())?;
  manager.refresh();
  if manager.llama_child.is_some() {
    return Ok(manager.status());
  }

  let config = manager.config.clone();
  if config.llama_model_path.trim().is_empty() {
    let error = "llamaModelPath empty".to_string();
    manager.last_error = Some(error.clone());
    return Err(error);
  }

  let child = Command::new(&config.llama_binary_path)
    .args([
      "-m",
      &config.llama_model_path,
      "-c",
      &config.context_size.to_string(),
      "-t",
      &config.threads.to_string(),
      "--n-gpu-layers",
      &config.gpu_layers.to_string(),
      "--host",
      &config.host,
      "--port",
      &config.port.to_string(),
    ])
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| {
      let msg = format!("Failed starting llama-server: {e}");
      manager.last_error = Some(msg.clone());
      msg
    })?;

  manager.llama_child = Some(child);
  manager.last_error = None;
  Ok(manager.status())
}

#[tauri::command]
fn start_whisper(state: tauri::State<'_, Mutex<RuntimeManager>>) -> Result<RuntimeStatus, String> {
  let mut manager = state.lock().map_err(|e| e.to_string())?;
  manager.refresh();
  if manager.whisper_child.is_some() {
    return Ok(manager.status());
  }

  let config = manager.config.clone();
  if config.whisper_model_path.trim().is_empty() {
    let error = "whisperModelPath empty".to_string();
    manager.last_error = Some(error.clone());
    return Err(error);
  }

  let child = Command::new(&config.whisper_binary_path)
    .args([
      "-m",
      &config.whisper_model_path,
      "-t",
      &config.threads.to_string(),
      "--step",
      "500",
      "--length",
      "5000",
    ])
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| {
      let msg = format!("Failed starting whisper-stream: {e}");
      manager.last_error = Some(msg.clone());
      msg
    })?;

  manager.whisper_child = Some(child);
  manager.last_error = None;
  Ok(manager.status())
}

#[tauri::command]
fn stop_all_runtimes(state: tauri::State<'_, Mutex<RuntimeManager>>) -> Result<RuntimeStatus, String> {
  let mut manager = state.lock().map_err(|e| e.to_string())?;

  if let Some(child) = manager.llama_child.as_mut() {
    let _ = child.kill();
  }
  manager.llama_child = None;

  if let Some(child) = manager.whisper_child.as_mut() {
    let _ = child.kill();
  }
  manager.whisper_child = None;

  Ok(manager.status())
}

#[tauri::command]
fn transcribe_audio(
  audio_base64: String,
  extension: Option<String>,
  state: tauri::State<'_, Mutex<RuntimeManager>>,
) -> Result<String, String> {
  let manager = state.lock().map_err(|e| e.to_string())?;
  let config = manager.config.clone();
  drop(manager);

  if config.whisper_model_path.trim().is_empty() {
    return Err("whisperModelPath empty".to_string());
  }

  let extension = extension
    .unwrap_or_else(|| "webm".to_string())
    .chars()
    .filter(|c| c.is_ascii_alphanumeric())
    .collect::<String>();

  let audio_bytes = STANDARD
    .decode(audio_base64)
    .map_err(|e| format!("audio decode failed: {e}"))?;

  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|e| e.to_string())?
    .as_millis();

  let mut temp_path = PathBuf::from(std::env::temp_dir());
  temp_path.push(format!("bilo_dictation_{timestamp}.{extension}"));

  fs::write(&temp_path, audio_bytes).map_err(|e| format!("temp audio write failed: {e}"))?;

  let output = Command::new(&config.whisper_binary_path)
    .args(["-m", &config.whisper_model_path, "-f"])
    .arg(&temp_path)
    .output()
    .map_err(|e| format!("whisper command failed to start: {e}"))?;

  let _ = fs::remove_file(&temp_path);

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!("whisper command failed: {stderr}"));
  }

  let transcript = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if transcript.is_empty() {
    return Err("whisper transcript empty".to_string());
  }

  Ok(transcript)
}

#[tauri::command]
fn write_worklog_file(
  date_key: String,
  content: String,
  output_dir: Option<String>,
) -> Result<String, String> {
  let output_dir = output_dir
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| "workspace/worklogs".to_string());

  let mut base = std::env::current_dir().map_err(|e| format!("current_dir failed: {e}"))?;
  base.push(output_dir);

  let target_path = resolve_worklog_path(&date_key, &base.to_string_lossy())?;
  fs::write(&target_path, content).map_err(|e| format!("worklog write failed: {e}"))?;

  Ok(target_path.to_string_lossy().to_string())
}

fn extract_completion_text(value: &serde_json::Value) -> Option<String> {
  if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
    return Some(content.to_string());
  }
  if let Some(text) = value
    .get("choices")
    .and_then(|v| v.as_array())
    .and_then(|choices| choices.first())
    .and_then(|first| first.get("text"))
    .and_then(|v| v.as_str())
  {
    return Some(text.to_string());
  }
  if let Some(content) = value
    .get("choices")
    .and_then(|v| v.as_array())
    .and_then(|choices| choices.first())
    .and_then(|first| first.get("message"))
    .and_then(|message| message.get("content"))
    .and_then(|v| v.as_str())
  {
    return Some(content.to_string());
  }
  None
}

#[tauri::command]
fn organize_note_with_runtime(
  input: String,
  state: tauri::State<'_, Mutex<RuntimeManager>>,
) -> Result<String, String> {
  if input.trim().is_empty() {
    return Ok(String::new());
  }

  let manager = state.lock().map_err(|e| e.to_string())?;
  let config = manager.config.clone();
  drop(manager);

  let client = Client::builder()
    .timeout(std::time::Duration::from_secs(25))
    .build()
    .map_err(|e| format!("http client error: {e}"))?;

  let system_prompt = "You are an expert note organizer embedded in a minimalist writing app. \
Your task is to reorganize messy, unstructured notes into clean, readable Markdown — without removing a single piece of information.\n\n\
Rules:\n\
1. PRESERVE ALL CONTENT — every idea, task, and detail must survive. Never delete anything.\n\
2. GROUP RELATED IDEAS under headings (## Heading) when there are 3 or more related items.\n\
3. FORMAT NATURALLY — prose stays as prose, tasks become checkboxes (- [ ]), lists become bullet points.\n\
4. TABLE DATA — if you see column-like content, format it as a proper Markdown table.\n\
5. REMOVE DUPLICATES — drop lines that are identical or nearly identical.\n\
6. FIX OBVIOUS GRAMMAR only when clearly broken. Preserve the author's voice.\n\
7. Return ONLY the organized note. No preamble, no explanation. Just the note.";

  let chat_url = format!("http://{}:{}/v1/chat/completions", config.host, config.port);
  let completion_response = client
    .post(&chat_url)
    .json(&json!({
      "messages": [
        { "role": "system", "content": system_prompt },
        { "role": "user", "content": input }
      ],
      "n_predict": 2048,
      "temperature": 0.15,
      "stream": false
    }))
    .send()
    .map_err(|e| format!("llama completion request failed: {e}"))?;

  if !completion_response.status().is_success() {
    return Err(format!(
      "llama completion failed with status {}",
      completion_response.status()
    ));
  }

  let payload: serde_json::Value = completion_response
    .json()
    .map_err(|e| format!("llama completion decode failed: {e}"))?;

  let content = extract_completion_text(&payload)
    .map(|text| text.trim().to_string())
    .filter(|text| !text.is_empty())
    .ok_or_else(|| "llama completion returned empty content".to_string())?;

  Ok(content)
}

/* ── Open URL in system browser ─────────────────────────────────── */

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
  #[cfg(target_os = "linux")]
  Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
  #[cfg(target_os = "windows")]
  Command::new("cmd").args(["/c", "start", &url]).spawn().map_err(|e| e.to_string())?;
  Ok(())
}

/* ── Jira ticket fetch (bypasses CORS via Rust/reqwest) ────────── */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct JiraTicket {
  key: String,
  summary: String,
  status: String,
  status_category: String,
  url: String,
}

#[tauri::command]
fn fetch_jira_ticket(
  base_url: String,
  email: String,
  api_token: String,
  ticket_key: String,
  ticket_url: String,
) -> Result<JiraTicket, String> {
  use base64::Engine as _;
  let credentials = base64::engine::general_purpose::STANDARD
    .encode(format!("{email}:{api_token}"));

  let api_url = format!(
    "{}/rest/api/3/issue/{}?fields=summary,status",
    base_url.trim_end_matches('/'),
    ticket_key
  );

  let client = Client::builder()
    .timeout(std::time::Duration::from_secs(10))
    .build()
    .map_err(|e| format!("HTTP client error: {e}"))?;

  let resp = client
    .get(&api_url)
    .header("Authorization", format!("Basic {credentials}"))
    .header("Accept", "application/json")
    .send()
    .map_err(|e| format!("Jira request failed: {e}"))?;

  if !resp.status().is_success() {
    return Err(format!(
      "Jira returned HTTP {} — check your base URL, email and API token in Settings → Jira",
      resp.status()
    ));
  }

  let body: serde_json::Value = resp
    .json()
    .map_err(|e| format!("Jira response parse error: {e}"))?;

  let summary = body
    .pointer("/fields/summary")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();

  let status = body
    .pointer("/fields/status/name")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();

  let cat_key = body
    .pointer("/fields/status/statusCategory/key")
    .and_then(|v| v.as_str())
    .unwrap_or("");

  let status_category = match cat_key {
    "done" => "done",
    "indeterminate" => "inProgress",
    _ => "todo",
  }
  .to_string();

  Ok(JiraTicket {
    key: ticket_key,
    summary,
    status,
    status_category,
    url: ticket_url,
  })
}

/* ── Apple Reminders via osascript ──────────────────────────────── */

#[tauri::command]
fn create_reminder(
  title: String,
  year: Option<i32>,
  month: Option<i32>,
  day: Option<i32>,
  hour: Option<i32>,
  minute: Option<i32>,
) -> Result<String, String> {
  // Use AppleScript property setters — locale-independent, always correct
  let due_block = match (year, month, day, hour, minute) {
    (Some(y), Some(mo), Some(d), Some(h), Some(mi)) => format!(
      r#"set dueDate to current date
  set year of dueDate to {y}
  set month of dueDate to {mo}
  set day of dueDate to {d}
  set hours of dueDate to {h}
  set minutes of dueDate to {mi}
  set seconds of dueDate to 0
  set due date of newReminder to dueDate
  set remind me date of newReminder to dueDate"#,
      y = y, mo = mo, d = d, h = h, mi = mi
    ),
    _ => String::new(),
  };

  let script = format!(
    r#"tell application "Reminders"
  set newReminder to make new reminder at end of default list with properties {{name:"{title}"}}
  {due_block}
end tell"#,
    title = title.replace('"', "'"),
    due_block = due_block,
  );

  let output = Command::new("osascript")
    .arg("-e")
    .arg(&script)
    .output()
    .map_err(|e| format!("osascript failed to start: {e}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!("Reminders error: {stderr}"));
  }

  Ok(format!("Reminder created: {title}"))
}

/* ── Cursor chat JSONL import ───────────────────────────────────── */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatConversation {
  date: String,
  file_name: String,
  raw_summary: String,
}

fn expand_tilde(path: &str) -> PathBuf {
  if let Some(rest) = path.strip_prefix("~/") {
    if let Some(home) = dirs_home() {
      return home.join(rest);
    }
  }
  PathBuf::from(path)
}

fn dirs_home() -> Option<PathBuf> {
  // HOME env var is the most reliable cross-platform way without adding dirs crate
  std::env::var("HOME").ok().map(PathBuf::from)
}

fn walk_jsonl_files(dir: &PathBuf, results: &mut Vec<PathBuf>) {
  if let Ok(entries) = fs::read_dir(dir) {
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_dir() {
        walk_jsonl_files(&path, results);
      } else if path.extension().map_or(false, |ext| ext == "jsonl") {
        results.push(path);
      }
    }
  }
}

fn extract_date_from_content(content: &str) -> Option<String> {
  // Look for <timestamp>2024-01-15T…</timestamp> or ISO date strings
  if let Some(start) = content.find("<timestamp>") {
    let rest = &content[start + 11..];
    if let Some(end) = rest.find("</timestamp>") {
      let ts = &rest[..end];
      // Return just the date portion
      return Some(ts.trim()[..10.min(ts.trim().len())].to_string());
    }
  }
  // Fallback: look for pattern like 2024-01-15
  for i in 0..content.len().saturating_sub(10) {
    let slice = &content[i..i + 10];
    if slice.len() == 10 {
      let parts: Vec<&str> = slice.split('-').collect();
      if parts.len() == 3
        && parts[0].len() == 4
        && parts[0].chars().all(|c| c.is_ascii_digit())
        && parts[1].len() == 2
        && parts[1].chars().all(|c| c.is_ascii_digit())
        && parts[2].len() == 2
        && parts[2].chars().all(|c| c.is_ascii_digit())
      {
        return Some(slice.to_string());
      }
    }
  }
  None
}

#[tauri::command]
fn import_cursor_chats(dir: String) -> Result<Vec<ChatConversation>, String> {
  let base = expand_tilde(&dir);
  if !base.exists() {
    return Err(format!("Directory not found: {}", base.display()));
  }

  let mut jsonl_files: Vec<PathBuf> = Vec::new();
  walk_jsonl_files(&base, &mut jsonl_files);

  // Sort by modification time (newest first)
  jsonl_files.sort_by(|a, b| {
    let ta = fs::metadata(a).and_then(|m| m.modified()).ok();
    let tb = fs::metadata(b).and_then(|m| m.modified()).ok();
    tb.cmp(&ta)
  });

  let mut conversations: Vec<ChatConversation> = Vec::new();

  for file_path in &jsonl_files {
    let content = match fs::read_to_string(file_path) {
      Ok(c) => c,
      Err(_) => continue,
    };

    let mut assistant_parts: Vec<String> = Vec::new();
    let mut detected_date: Option<String> = None;
    let mut char_budget: usize = 4000;

    for line in content.lines() {
      let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => continue,
      };

      // Extract role
      let role = v
        .get("role")
        .and_then(|r| r.as_str())
        .unwrap_or("")
        .to_string();

      // Try to get text content from various schema shapes
      let text = v
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .or_else(|| v.get("content").and_then(|c| c.as_str()))
        .unwrap_or("");

      // Detect date from any message if not yet found
      if detected_date.is_none() {
        detected_date = extract_date_from_content(text);
      }

      // Only accumulate assistant messages for summarization
      if role == "assistant" && !text.is_empty() && char_budget > 0 {
        let take = text.len().min(char_budget);
        assistant_parts.push(text[..take].to_string());
        char_budget = char_budget.saturating_sub(take);
      }
    }

    if assistant_parts.is_empty() {
      continue;
    }

    // Derive date from file metadata if not found in content
    let date = detected_date.unwrap_or_else(|| {
      fs::metadata(file_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| {
          t.duration_since(UNIX_EPOCH).ok().map(|d| {
            let secs = d.as_secs();
            // Simple YYYY-MM-DD from unix timestamp (UTC)
            let days = secs / 86400;
            let y = 1970 + days / 365;
            format!("{y:04}-01-01")
          })
        })
        .unwrap_or_else(|| "unknown".to_string())
    });

    let file_name = file_path
      .file_name()
      .map(|n| n.to_string_lossy().to_string())
      .unwrap_or_default();

    conversations.push(ChatConversation {
      date,
      file_name,
      raw_summary: assistant_parts.join("\n\n"),
    });
  }

  Ok(conversations)
}

/* ── Cursor agent integration ───────────────────────────────────── */

/// Find the cursor-agent binary, trying common install locations.
fn find_cursor_agent() -> Result<String, String> {
  let home = std::env::var("HOME").unwrap_or_default();

  let candidates = [
    format!("{}/.local/bin/cursor-agent", home),
    "/usr/local/bin/cursor-agent".to_string(),
    "/opt/homebrew/bin/cursor-agent".to_string(),
  ];

  for path in &candidates {
    if std::path::Path::new(path).exists() {
      return Ok(path.clone());
    }
  }

  Err(
    "cursor-agent not found. It is installed automatically by Cursor.app — \
     make sure Cursor is installed and try restarting the app."
      .to_string(),
  )
}

/// Find the kiro-agent binary, trying common install locations.
fn find_kiro_agent() -> Result<String, String> {
  let home = std::env::var("HOME").unwrap_or_default();

  let candidates = [
    format!("{}/.local/bin/kiro-agent", home),
    format!("{}/Library/Application Support/kiro/bin/kiro-agent", home),
    "/usr/local/bin/kiro-agent".to_string(),
    "/opt/homebrew/bin/kiro-agent".to_string(),
  ];

  for path in &candidates {
    if std::path::Path::new(path).exists() {
      return Ok(path.clone());
    }
  }

  Err(
    "kiro-agent not found. Install Kiro and make sure the agent binary is on PATH."
      .to_string(),
  )
}

/// Ask the Cursor agent a question and return the plain-text response.
/// Uses `cursor-agent --print --output-format text` for queries.
/// Runs on a dedicated blocking thread so it never stalls the async runtime.
#[tauri::command]
async fn acp_query(
  system_prompt: String,
  user_prompt: String,
  api_key: String,
) -> Result<String, String> {
  let agent = find_cursor_agent()?;

  let full_prompt = if system_prompt.trim().is_empty() {
    user_prompt.clone()
  } else {
    format!("{}\n\n---\n\n{}", system_prompt, user_prompt)
  };

  let prompt_chars = full_prompt.len();
  eprintln!("[bilo/ai] → cursor-agent starting  prompt_chars={prompt_chars}  agent={agent}");
  let t0 = std::time::Instant::now();

  // spawn_blocking keeps the tokio executor free while cursor-agent runs
  let output = tokio::task::spawn_blocking(move || {
    Command::new(&agent)
      .args([
        "--print",
        "--output-format",
        "text",
        "--trust",
        "--api-key",
        &api_key,
        &full_prompt,
      ])
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .output()
  })
  .await
  .map_err(|e| format!("Task panicked: {e}"))?
  .map_err(|e| format!("Failed to run cursor-agent: {e}"))?;

  let elapsed_ms = t0.elapsed().as_millis();

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    eprintln!("[bilo/ai] ✗ cursor-agent failed in {elapsed_ms}ms: {stderr}");
    return Err(format!("cursor-agent failed: {stderr}"));
  }

  let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if text.is_empty() {
    eprintln!("[bilo/ai] ✗ cursor-agent returned empty response in {elapsed_ms}ms");
    return Err("cursor-agent returned an empty response".to_string());
  }

  eprintln!("[bilo/ai] ✓ cursor-agent done in {elapsed_ms}ms  response_chars={}", text.len());
  Ok(text)
}

/// Ask the Kiro agent a question and return the plain-text response.
/// Same interface as acp_query — agent chosen by the caller.
#[tauri::command]
async fn kiro_query(
  system_prompt: String,
  user_prompt: String,
  api_key: String,
) -> Result<String, String> {
  let agent = find_kiro_agent()?;

  let full_prompt = if system_prompt.trim().is_empty() {
    user_prompt.clone()
  } else {
    format!("{}\n\n---\n\n{}", system_prompt, user_prompt)
  };

  let prompt_chars = full_prompt.len();
  eprintln!("[bilo/ai] → kiro-agent starting  prompt_chars={prompt_chars}  agent={agent}");
  let t0 = std::time::Instant::now();

  let output = tokio::task::spawn_blocking(move || {
    Command::new(&agent)
      .args([
        "--print",
        "--output-format",
        "text",
        "--trust",
        "--api-key",
        &api_key,
        &full_prompt,
      ])
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .output()
  })
  .await
  .map_err(|e| format!("Task panicked: {e}"))?
  .map_err(|e| format!("Failed to run kiro-agent: {e}"))?;

  let elapsed_ms = t0.elapsed().as_millis();

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    eprintln!("[bilo/ai] ✗ kiro-agent failed in {elapsed_ms}ms: {stderr}");
    return Err(format!("kiro-agent failed: {stderr}"));
  }

  let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if text.is_empty() {
    return Err("kiro-agent returned an empty response".to_string());
  }

  eprintln!("[bilo/ai] ✓ kiro-agent done in {elapsed_ms}ms  response_chars={}", text.len());
  Ok(text)
}

/// Probe which AI agent binaries are installed on this machine.
/// Returns a JSON object: { cursor: bool, kiro: bool }
#[tauri::command]
fn detect_agents() -> String {
  let cursor_ok = find_cursor_agent().is_ok();
  let kiro_ok = find_kiro_agent().is_ok();
  format!(r#"{{"cursor":{cursor_ok},"kiro":{kiro_ok}}}"#)
}

/// Read a JSON file from disk and return its contents as a string.
/// The frontend merges this into localStorage.
#[tauri::command]
fn read_notes_json(path: String) -> Result<String, String> {
  let p: PathBuf = if path.starts_with('~') {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(path.replacen('~', &home, 1))
  } else {
    PathBuf::from(&path)
  };
  fs::read_to_string(&p).map_err(|e| format!("Failed to read {}: {}", p.display(), e))
}

/// Push notes JSON to a GitHub private repo as a commit.
/// Uses the GitHub REST API (no git CLI required).
#[tauri::command]
async fn github_sync_push(repo_url: String, token: String, payload: String) -> Result<(), String> {
  tokio::task::spawn_blocking(move || github_sync_push_inner(repo_url, token, payload))
    .await
    .map_err(|e| format!("Task panicked: {e}"))?
}

fn github_sync_push_inner(repo_url: String, token: String, payload: String) -> Result<(), String> {
  // Parse owner/repo from URL like https://github.com/owner/repo or github.com/owner/repo
  let stripped = repo_url
    .trim_start_matches("https://github.com/")
    .trim_start_matches("http://github.com/")
    .trim_start_matches("github.com/")
    .trim_end_matches('/');
  let parts: Vec<&str> = stripped.splitn(2, '/').collect();
  if parts.len() != 2 {
    return Err("Invalid GitHub repo URL — expected https://github.com/owner/repo".to_string());
  }
  let (owner, repo) = (parts[0], parts[1]);

  let client = Client::new();
  let file_path = "bilo-notes.json";
  let api_base = format!("https://api.github.com/repos/{}/{}/contents/{}", owner, repo, file_path);

  // Get current SHA (if file exists, we need it for update)
  let get_resp = client
    .get(&api_base)
    .header("Authorization", format!("Bearer {}", token))
    .header("User-Agent", "bilo-app")
    .header("Accept", "application/vnd.github.v3+json")
    .send()
    .map_err(|e| format!("GitHub GET failed: {e}"))?;

  let sha: Option<String> = if get_resp.status().is_success() {
    let body: serde_json::Value = get_resp.json().map_err(|e| e.to_string())?;
    body["sha"].as_str().map(|s| s.to_string())
  } else {
    None
  };

  let content_b64 = STANDARD.encode(payload.as_bytes());
  let now = chrono_ts();
  let mut body_map = serde_json::Map::new();
  body_map.insert("message".to_string(), json!(format!("bilo sync {}", now)));
  body_map.insert("content".to_string(), json!(content_b64));
  if let Some(s) = sha {
    body_map.insert("sha".to_string(), json!(s));
  }

  let put_resp = client
    .put(&api_base)
    .header("Authorization", format!("Bearer {}", token))
    .header("User-Agent", "bilo-app")
    .header("Accept", "application/vnd.github.v3+json")
    .json(&body_map)
    .send()
    .map_err(|e| format!("GitHub PUT failed: {e}"))?;

  if !put_resp.status().is_success() {
    let status = put_resp.status();
    let body = put_resp.text().unwrap_or_default();
    return Err(format!("GitHub API error {}: {}", status, body));
  }

  Ok(())
}

/// Pull notes JSON from a GitHub private repo.
#[tauri::command]
async fn github_sync_pull(repo_url: String, token: String) -> Result<String, String> {
  tokio::task::spawn_blocking(move || github_sync_pull_inner(repo_url, token))
    .await
    .map_err(|e| format!("Task panicked: {e}"))?
}

fn github_sync_pull_inner(repo_url: String, token: String) -> Result<String, String> {
  let stripped = repo_url
    .trim_start_matches("https://github.com/")
    .trim_start_matches("http://github.com/")
    .trim_start_matches("github.com/")
    .trim_end_matches('/');
  let parts: Vec<&str> = stripped.splitn(2, '/').collect();
  if parts.len() != 2 {
    return Err("Invalid GitHub repo URL".to_string());
  }
  let (owner, repo) = (parts[0], parts[1]);

  let client = Client::new();
  let file_path = "bilo-notes.json";
  let api_base = format!("https://api.github.com/repos/{}/{}/contents/{}", owner, repo, file_path);

  let resp = client
    .get(&api_base)
    .header("Authorization", format!("Bearer {}", token))
    .header("User-Agent", "bilo-app")
    .header("Accept", "application/vnd.github.v3+json")
    .send()
    .map_err(|e| format!("GitHub GET failed: {e}"))?;

  if !resp.status().is_success() {
    let status = resp.status();
    if status.as_u16() == 404 {
      return Err("File not found in repo — push first.".to_string());
    }
    let body = resp.text().unwrap_or_default();
    return Err(format!("GitHub API error {}: {}", status, body));
  }

  let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
  let b64 = body["content"]
    .as_str()
    .ok_or("No content field in GitHub response")?
    .replace('\n', "");

  let decoded = STANDARD.decode(b64.as_bytes()).map_err(|e| e.to_string())?;
  String::from_utf8(decoded).map_err(|e| e.to_string())
}

fn chrono_ts() -> String {
  let secs = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  format!("{}", secs)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(Mutex::new(RuntimeManager::default()))
    .invoke_handler(tauri::generate_handler![
      get_runtime_config,
      set_runtime_config,
      get_runtime_status,
      start_llama,
      start_whisper,
      stop_all_runtimes,
      transcribe_audio,
      write_worklog_file,
      organize_note_with_runtime,
      create_reminder,
      import_cursor_chats,
      read_notes_json,
      acp_query,
      kiro_query,
      detect_agents,
      fetch_jira_ticket,
      open_url,
      github_sync_push,
      github_sync_pull
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
