
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat } from "@google/genai";
import { Send, RefreshCw, Share2, BellRing, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const SPREADSHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1Y9NE_QmtnMB612wjFhmjg8v2lAXsZfmlMtZIW_IiTuE/export?format=csv"; 

const parseCSV = (csv: string) => {
  const rows = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || char === '\r') {
        if (currentField || currentRow.length > 0) {
          currentRow.push(currentField.trim());
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
        }
        if (char === '\r' && nextChar === '\n') i++;
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];
  const validRows = rows.filter(r => r.some(cell => cell.trim() !== ''));
  if (validRows.length === 0) return [];
  
  const headers = validRows[0].map(h => h.toLowerCase().trim());
  return validRows.slice(1)
    .filter(row => row.length >= 2 && row[1] && row[1].trim() !== '')
    .map((row, rowIndex) => {
      const obj: any = { id: rowIndex }; 
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
};

const getSystemInstruction = (data: any[]) => `
Você é o "Carnabot", o guia oficial do Carnaval de Rua do Rio de Janeiro.
Planilha de dados: ${JSON.stringify(data, null, 2)}

DINÂMICA:
- Tom Padrão: Carioca raiz ("mermão", "coé", "papo reto").
- Modo Bicha Afrontosa: Se o usuário usar gírias LGBTQ+, mude para tom performático ("mona", "bicha", "arrasou").

REGRAS:
- Formato Vertical: Nome em Negrito, informações técnicas em lista, comentário final divertido.
- Instagram: Converta @nomedobloco em link clicável.
- Se houver mudanças recentes nos campos Local, Bairro ou Hora, mencione que a informação está fresquinha.
`;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  hideTimestamp?: boolean;
}

declare global {
  interface Window {
    OneSignalDeferred: any[];
    OneSignal: any;
  }
}

const App = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [blocoCount, setBlocoCount] = useState(0);
  
  const [notificationStatus, setNotificationStatus] = useState<'default' | 'granted' | 'denied' | 'loading' | 'error'>('loading');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initBot = async () => {
      try {
        const response = await fetch(SPREADSHEET_CSV_URL);
        const csvText = await response.text();
        const data = parseCSV(csvText);
        
        setBlocoCount(data.length);

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const chat = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: { systemInstruction: getSystemInstruction(data) },
        });
        setChatSession(chat);

        setMessages([{
          id: '1',
          text: `Coé folião! **Carnabot** na área. 🎊\nTô com os blocos do Carnaval 2026 aqui na mão. Qual a boa?`,
          sender: 'bot',
          timestamp: new Date(),
          hideTimestamp: true
        }]);

        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          setTimeout(async () => {
            try {
              const permission = await OneSignal.Notifications.permission;
              setNotificationStatus(permission ? 'granted' : 'default');
              
              const isOptedOut = await OneSignal.User.PushSubscription.isOptedOut;
              setIsSubscribed(permission && !isOptedOut);

              OneSignal.Notifications.addEventListener("permissionChange", (permission: boolean) => {
                setNotificationStatus(permission ? 'granted' : 'denied');
              });
            } catch (e) {
              setNotificationStatus('error');
            }
          }, 1000);
        });

      } catch (error) {
        console.error("Erro fatal:", error);
      } finally {
        setIsFetchingData(false);
      }
    };
    initBot();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !chatSession || isLoading) return;
    const userText = inputText;
    const userMsg: Message = { id: Date.now().toString(), text: userText, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const result = await chatSession.sendMessage({ message: userText });
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: result.text || "Deu zebra aqui, mermão.",
        sender: 'bot',
        timestamp: new Date(),
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: 'err', text: "Pane no sistema! Tenta de novo.", sender: 'bot', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (notificationStatus === 'loading' || !window.OneSignal) return;
    
    setNotificationStatus('loading');

    try {
      if (notificationStatus !== 'granted') {
        const permission = await window.OneSignal.Notifications.requestPermission();
        if (permission === 'granted') {
          setNotificationStatus('granted');
          setIsSubscribed(true);
          setMessages(prev => [...prev, {
            id: 'notif-success',
            text: "✅ **Boa!** Já te coloquei na lista VIP. Se algum bloco mudar de lugar ou hora, eu te dou um grito aqui nas notificações!",
            sender: 'bot',
            timestamp: new Date()
          }]);
        } else {
          setNotificationStatus('denied');
          setIsSubscribed(false);
        }
      } else {
        const isOptedOut = await window.OneSignal.User.PushSubscription.isOptedOut;
        if (isOptedOut) {
          await window.OneSignal.User.PushSubscription.optIn();
          setIsSubscribed(true);
        } else {
          await window.OneSignal.User.PushSubscription.optOut();
          setIsSubscribed(false);
        }
        setNotificationStatus('granted'); // Manteve a permissão, apenas mudou o opt-in
      }
    } catch (err) {
      console.error("Erro no toggle de notificações:", err);
      setNotificationStatus('error');
    }
  };

  const getWhatsAppLink = (text: string) => {
    const cleanText = text.replace(/[*_#]/g, ''); 
    const footer = "\n\nInformação enviada pelo Carnabot RJ 2026 🎊";
    return `https://wa.me/?text=${encodeURIComponent(cleanText + footer)}`;
  };

  if (isFetchingData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#2b2b2b] text-white">
        <RefreshCw className="animate-spin mb-4 text-white" size={48} />
        <h1 className="text-xl font-bold tracking-tighter">CARNABOT 2026</h1>
        <p className="text-sm opacity-60">Lendo os dados da folia...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f0f2f5] font-sans overflow-hidden">
      <header className="bg-[#2b2b2b] text-white p-4 flex items-center justify-between shadow-lg z-10 border-b border-white/5 relative">
        <div className="flex flex-col">
          <h1 className="text-xl font-black uppercase text-white tracking-tighter">Carnabot 🎊</h1>
          <p className="text-[10px] font-bold uppercase text-white/40">
            {blocoCount} blocos mapeados
          </p>
        </div>
        
        <div className="flex items-center space-x-3 bg-white/5 px-3 py-2 rounded-2xl border border-white/10">
          <span className="text-[11px] font-black uppercase text-white/70 tracking-tight">Notificações</span>
          <button 
            onClick={handleToggleNotifications}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none ${
              isSubscribed ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-gray-600'
            } ${notificationStatus === 'loading' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            disabled={notificationStatus === 'loading'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 ${
                isSubscribed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#e5ddd5] relative" 
            style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}>
        <div className="max-w-2xl mx-auto w-full flex flex-col">
          {messages.map((msg) => {
            const isBlockInfo = msg.sender === 'bot' && (msg.text.toLowerCase().includes('local:') || msg.text.toLowerCase().includes('data:'));
            
            return (
              <div key={msg.id} className={`flex w-full mb-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-[18px] shadow-sm ${msg.sender === 'user' ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                  <div className="prose prose-sm max-w-none text-[15px] leading-snug markdown-content">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                  
                  {isBlockInfo && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <a 
                        href={getWhatsAppLink(msg.text)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center space-x-2 w-full py-2.5 bg-[#25D366] hover:bg-[#1ebe57] text-white font-black text-[12px] uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 no-underline"
                      >
                        <Share2 size={16} />
                        <span>Mandar pro grupo</span>
                      </a>
                    </div>
                  )}

                  {!msg.hideTimestamp && (
                    <div className="flex items-center justify-end mt-1 opacity-40">
                      <span className="text-[10px]">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="bg-white px-4 py-3 rounded-[18px] shadow-sm flex space-x-1">
                <span className="w-1.5 h-1.5 bg-[#2b2b2b] rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-[#2b2b2b] rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></span>
                <span className="w-1.5 h-1.5 bg-[#2b2b2b] rounded-full animate-bounce" style={{animationDelay:'0.4s'}}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="bg-white p-3 pb-8 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="max-w-2xl mx-auto flex items-end space-x-2">
          <div className="flex-1 bg-gray-100 rounded-[24px] px-4 py-2 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2b2b2b] transition-all">
             <textarea
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}}
                placeholder="Qual o próximo bloco?"
                className="w-full bg-transparent border-none focus:ring-0 text-base py-1 outline-none resize-none max-h-32"
              />
          </div>
          <button type="submit" className="p-4 rounded-full bg-[#2b2b2b] text-white active:scale-90 transition-all shadow-lg">
            <Send size={20} fill="currentColor" />
          </button>
        </form>
      </div>

      <style>{`
        .markdown-content p { margin-bottom: 0.5rem; white-space: pre-wrap; }
        .markdown-content strong { font-weight: 800; color: #1a1a1a; }
        .markdown-content a { color: #0066cc; font-weight: 600; text-decoration: underline; }
        .markdown-content ul { list-style: none; padding-left: 0; }
        .markdown-content li { margin-bottom: 4px; border-left: 3px solid #eee; padding-left: 8px; }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
