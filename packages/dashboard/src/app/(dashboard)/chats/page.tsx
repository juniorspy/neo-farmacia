"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Search, Bot, User, Send } from "lucide-react";

interface Chat {
  id: string;
  customer: string;
  phone: string;
  lastMessage: string;
  time: string;
  unread: number;
  mode: "bot" | "manual";
}

interface Message {
  id: string;
  text: string;
  sender: "customer" | "bot" | "agent";
  time: string;
}

const mockChats: Chat[] = [
  { id: "1", customer: "María López", phone: "+1809-555-0101", lastMessage: "Tienen ibuprofeno de 400mg?", time: "10:30", unread: 2, mode: "bot" },
  { id: "2", customer: "José García", phone: "+1809-555-0102", lastMessage: "Ok gracias, voy a pasar a buscar", time: "10:15", unread: 0, mode: "manual" },
  { id: "3", customer: "Ana Reyes", phone: "+1809-555-0103", lastMessage: "Cuánto cuesta la amoxicilina?", time: "09:45", unread: 1, mode: "bot" },
  { id: "4", customer: "Carlos Marte", phone: "+1809-555-0104", lastMessage: "Necesito medicamentos para la presión", time: "09:30", unread: 0, mode: "bot" },
];

const mockMessages: Message[] = [
  { id: "1", text: "Hola buenas! Tienen ibuprofeno?", sender: "customer", time: "10:25" },
  { id: "2", text: "¡Hola María! Sí, tenemos Ibuprofeno 400mg disponible. El precio es RD$200 por caja de 10 tabletas. ¿Le gustaría agregarlo a su pedido?", sender: "bot", time: "10:25" },
  { id: "3", text: "Si, y también acetaminofén", sender: "customer", time: "10:28" },
  { id: "4", text: "Perfecto! Tenemos Acetaminofén 500mg a RD$150 la caja. Le agrego ambos productos:\n\n1x Ibuprofeno 400mg - RD$200\n1x Acetaminofén 500mg - RD$150\n\nTotal: RD$350\n\n¿Confirma el pedido?", sender: "bot", time: "10:28" },
  { id: "5", text: "Tienen ibuprofeno de 400mg?", sender: "customer", time: "10:30" },
];

export default function ChatsPage() {
  const [selectedChat, setSelectedChat] = useState<Chat | null>(mockChats[0]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const filteredChats = mockChats.filter(
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
          {filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={clsx(
                "px-4 py-3 cursor-pointer transition-colors",
                selectedChat?.id === chat.id ? "bg-primary-light" : "hover:bg-slate-50"
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{chat.customer}</p>
                <span className="text-[11px] text-slate-400">{chat.time}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-slate-500 truncate max-w-[180px]">{chat.lastMessage}</p>
                <div className="flex items-center gap-1.5">
                  {chat.mode === "bot" ? (
                    <Bot className="w-3 h-3 text-violet-500" />
                  ) : (
                    <User className="w-3 h-3 text-sky-500" />
                  )}
                  {chat.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">
                      {chat.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
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
            <button
              className={clsx(
                "text-xs px-3 py-1.5 rounded-full font-medium border transition-colors",
                selectedChat.mode === "bot"
                  ? "bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100"
                  : "bg-sky-50 text-sky-600 border-sky-200 hover:bg-sky-100"
              )}
            >
              {selectedChat.mode === "bot" ? "🤖 Bot activo" : "👤 Modo manual"}
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {mockMessages.map((msg) => (
              <div
                key={msg.id}
                className={clsx(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.sender === "customer"
                    ? "bg-white border border-slate-200 text-slate-800 ml-0"
                    : "bg-primary text-white ml-auto"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <p className={clsx(
                  "text-[10px] mt-1",
                  msg.sender === "customer" ? "text-slate-400" : "text-white/60"
                )}>
                  {msg.time}
                  {msg.sender === "bot" && " · 🤖"}
                  {msg.sender === "agent" && " · 👤"}
                </p>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="bg-white border-t border-slate-200 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
              />
              <button className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors">
                <Send className="w-4 h-4" />
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
