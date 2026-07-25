export interface ChatMessage {
  chat_message_id: string;
  project_id: string;
  sender: "user" | "designer" | "system";
  content: string;
  created_at: string;
}
