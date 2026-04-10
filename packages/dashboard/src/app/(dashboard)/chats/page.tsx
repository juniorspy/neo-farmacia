"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import { Search, Bot, User, Send, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Chat {
  id: string;
  customer: string;
  phone: string;
  lastMessage: string;
  time: string;
  sender: string;
  mode: "bot" | "manual";
}

interface Message {
  id: string;
  text: string;
  sender: "customer" | "bot" | "agent";
  direction: string;
  time: string;
}

export default function ChatsPage() {
  const { currentStore } = useStore();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const storeId = currentStore?.id || "store_leo";

  const loadChats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Chat[]>(`/api/v1/stores/${storeId}/chats`);
      setChats(data);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { loadChats(); }, [loadChats]);

  async function selectChat(chat: Chat) {
    setSelectedChat(chat);
    setMessagesLoading(true);
    try {
      const data = await api.get<Message[]>(`/api/v1/stores/${storeId}/chats/${chat.id}/messages`);
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }

  async function sendMessage() {
    if (!message.trim() || !selectedChat) return;
    setSending(true);
    try {
      const sent = await api.post<Message>(`/api/v1/stores/${storeId}/chats/${selectedChat.id}/messages`, { text: message });
      setMessages((prev) => [...prev, sent]);
      setMessage("");
    } catch {
      alert("Error enviando mensaje");
    } finally {
      setSending(false);
    }
  }

  const filteredChats = chats.filter(
    (c) => !search || c.customer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex gap-0 h-[calc(100vh-7.5rem)] -m-4 lg:-m-6">
      {/* Chat list */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar chat..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus-primary"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {loading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No hay chats activos
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => selectChat(chat)}
                className={clsx(
                  "px-4 py-3 cursor-pointer transition-colors",
                  selectedChat?.id === chat.id ? "bg-primary-light" : "hover:bg-slate-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{chat.customer}</p>
                  <span className="text-[11px] text-slate-400">
                    {new Date(chat.time).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500 truncate max-w-[180px]">{chat.lastMessage}</p>
                  {chat.mode === "bot" ? (
                    <Bot className="w-3 h-3 text-violet-500" />
                  ) : (
                    <User className="w-3 h-3 text-sky-500" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat messages */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col bg-slate-50">
          {/* Chat header */}
          <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">{selectedChat.customer}</p>
              <p className="text-xs text-slate-400">{selectedChat.phone}</p>
            </div>
            <span
              className={clsx(
                "text-xs px-3 py-1.5 rounded-full font-medium border",
                selectedChat.mode === "bot"
                  ? "bg-violet-50 text-violet-600 border-violet-200"
                  : "bg-sky-50 text-sky-600 border-sky-200"
              )}
            >
              {selectedChat.mode === "bot" ? "Bot activo" : "Modo manual"}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messagesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">Sin mensajes</div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.direction === "inbound"
                      ? "bg-white border border-slate-200 text-slate-800 ml-0"
                      : "bg-primary text-white ml-auto"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <p className={clsx(
                    "text-[10px] mt-1",
                    msg.direction === "inbound" ? "text-slate-400" : "text-white/60"
                  )}>
                    {new Date(msg.time).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                    {msg.sender === "bot" && " · Bot"}
                    {msg.sender === "agent" && " · Agente"}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="bg-white border-t border-slate-200 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !message.trim()}
                className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Selecciona un chat
        </div>
      )}
    </div>
  );
}
