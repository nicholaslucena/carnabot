
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat } from "@google/genai";
import { Send, Info, RefreshCw, Share2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// --- CONFIGURAÇÃO DA PLANILHA ---
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
  
  const headers = validRows[0].map(h => h.toLowerCase());
  return validRows.slice(1)
    .filter(row => row.length >= 2 && row[1] && row[1].trim() !== '')
    .map(row => {
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
};

const getSystemInstruction = (data: any[]) => `
Você é o "Carnabot", o guia oficial do Carnaval de Rua do Rio de Janeiro.
Sua única fonte de verdade absoluta é esta planilha:
${JSON.stringify(data, null, 2)}

REGRAS CRÍTICAS:
1. SE NÃO ACHAR A INFORMAÇÃO: Não use sempre a mesma frase. Use variações cariocas aleatórias como: 
   - "Cara, procurei aqui mas esse bloco tá mais sumido que o bicheiro na quarta-feira de cinzas."
   - "Ih mermão, achei informação sobre esse não. Deve tá na clandestinidade!"
   - "Papo reto: esse bloco aí eu não vi na lista oficial não."
   - "Vou te falar, esse aí eu não achei não. Tem certeza do nome?"
   - "Achei nada não, mermão. Esse bloco aí tá jogando escondido."
   - "Coé, esse aí nem o Google acha. Tá certo o nome?"

2. FORMATO OBRIGATÓRIO (Vertical, Limpo e com Espaçamento Extra):
Deve haver uma linha em branco entre o título e as informações, e outra linha em branco entre as informações e o comentário final.

**[NOME DO BLOCO]**

Local: [Local de Saída]
Bairro: [Extraia o bairro do endereço/local]
Horário: [Horário]
Data: [Nome do Dia] (dd/mm)

[Insira aqui um comentário curto e bem carioca sobre o bloco ou a situação]

3. CALENDÁRIO CARNAVAL 2026:
- 12/02: Quinta | 13/02: Sexta | 14/02: Sábado | 15/02: Domingo | 16/02: Segunda | 17/02: Terça | 18/02: Quarta
SEMPRE use o formato "Nome do dia (dd/mm)".

4. INSTAGRAM E LINKS:
Sempre que citar um Instagram ou handle (ex: @nomedobloco), transforme-o obrigatoriamente em um link Markdown: [@nomedobloco](https://instagram.com/nomedobloco).

5. TOM DE VOZ: Carioca raiz, descontraído, sem alucinações.
`;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const App = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [blocoCount, setBlocoCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initBot = async () => {
      // @ts-ignore
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        if (tg.setHeaderColor) tg.setHeaderColor('secondary_bg_color');
      }

      try {
        const response = await fetch(SPREADSHEET_CSV_URL);
        const csvText = await response.text();
        const data = parseCSV(csvText);
        setBlocoCount(data.length);

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const chat = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: {
            systemInstruction: getSystemInstruction(data),
          },
        });
        setChatSession(chat);

        setMessages([
          {
            id: '1',
            text: `Coé ${tg?.initDataUnsafe?.user?.first_name || 'folião'}! **Carnabot** na área. 🎊\n\nTô com os blocos do Carnaval 2026 aqui. Qual a boa? 🥁`,
            sender: 'bot',
            timestamp: new Date(),
          }
        ]);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
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
    const userMsg: Message = {
      id: Date.now().toString(),
      text: userText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const result = await chatSession.sendMessage({ message: userText });
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: result.text || "Achei nada não, mermão.",
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Ih mermão, deu pane aqui. Tenta falar comigo de novo! 😅",
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const getWhatsAppLink = (text: string) => {
    const footer = "\n\nInformação do CarnaBot 2026. Tecnologia à serviço da zoeira, galhofa, farra e plahaçada sem limites";
    const fullMessage = text + footer;
    return `https://wa.me/?text=${encodeURIComponent(fullMessage)}`;
  };

  if (isFetchingData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0088cc] text-white p-6 text-center">
        <RefreshCw className="animate-spin mb-4" size={48} />
        <h1 className="text-2xl font-bold mb-2">Peraí...</h1>
        <p className="opacity-80">Carregando os blocos do Carnaval 2026! 🥁</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#e7ebf0] font-sans overflow-hidden" 
         style={{ backgroundColor: 'var(--tg-theme-bg-color, #e7ebf0)' }}>
      
      <header className="bg-[#0088cc] text-white p-4 flex items-center justify-center shadow-md z-10"
              style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #0088cc)', color: 'var(--tg-theme-text-color, #ffffff)' }}>
        <div className="text-center">
          <h1 className="text-xl font-black tracking-tight leading-none uppercase">Carnabot 🎊</h1>
          <p className="text-[10px] opacity-80 mt-1 uppercase tracking-widest" style={{ color: 'var(--tg-theme-hint-color, #b3e0ff)' }}>
            {blocoCount} blocos no sistema
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div className="max-w-3xl mx-auto w-full flex flex-col">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex w-full mb-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-[12px] shadow-sm relative transition-all duration-200 ${
                  msg.sender === 'user'
                    ? 'bg-[#effdde] text-gray-800 rounded-tr-none'
                    : 'bg-white text-gray-800 rounded-tl-none'
                }`}
                style={msg.sender === 'user' ? { 
                  backgroundColor: 'var(--tg-theme-button-color, #effdde)', 
                  color: 'var(--tg-theme-button-text-color, #000000)' 
                } : {
                  backgroundColor: 'var(--tg-theme-bg-color, #ffffff)',
                  color: 'var(--tg-theme-text-color, #000000)'
                }}
              >
                {/* Triangular Tail SVG - Sharp Corners */}
                <div className={`absolute top-0 w-[8px] h-[8px] ${
                  msg.sender === 'user' ? '-right-2' : '-left-2'
                }`}>
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <path 
                      fill={msg.sender === 'user' ? 'var(--tg-theme-button-color, #effdde)' : 'var(--tg-theme-bg-color, #ffffff)'} 
                      d={msg.sender === 'user' ? "M0,0 L8,0 L0,8 Z" : "M8,0 L0,0 L8,8 Z"} 
                    />
                  </svg>
                </div>

                <div className="prose prose-sm max-w-none text-[15px] leading-snug break-words markdown-content">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>

                {/* Share button - Visible for all bot messages EXCEPT the greeting (id: '1') */}
                {msg.sender === 'bot' && msg.id !== '1' && (
                  <div className="mt-3">
                    <a 
                      href={getWhatsAppLink(msg.text)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-2 w-full py-2.5 bg-[#1B8BD1] text-white font-bold text-[10px] uppercase tracking-wider rounded-[4px] border border-[#EEF0F2] shadow-sm transition-all active:scale-95 no-underline"
                    >
                      <Share2 size={14} strokeWidth={3} />
                      <span>compartilhar no zap</span>
                    </a>
                  </div>
                )}

                <div className="flex items-center justify-end mt-2">
                  <span className="text-[10px] text-gray-400 select-none" style={{ color: 'var(--tg-theme-hint-color, #9ca3af)' }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="bg-white px-4 py-3 rounded-[12px] rounded-tl-none shadow-sm relative flex items-center space-x-1" style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}>
                <div className="absolute top-0 -left-2 w-[8px] h-[8px]">
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <path fill="var(--tg-theme-bg-color, #ffffff)" d="M8,0 L0,0 L8,8 Z" />
                  </svg>
                </div>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="bg-white border-t border-gray-200 p-3 pb-8" style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #ffffff)', borderTopColor: 'var(--tg-theme-hint-color, #e5e7eb)' }}>
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="max-w-3xl mx-auto flex items-end space-x-2">
          <div className="flex-1 relative flex items-center bg-gray-100 rounded-[20px] px-4 py-1.5 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#0088cc] transition-all"
               style={{ backgroundColor: 'var(--tg-theme-bg-color, #f3f4f6)' }}>
             <button type="button" className="p-1 text-gray-400 hover:text-[#0088cc] transition-colors">
                <Info size={18} />
             </button>
             <textarea
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Qual o bloco de hoje?"
                className="flex-1 bg-transparent border-none focus:ring-0 text-base py-1.5 resize-none max-h-32 placeholder:text-gray-400"
                style={{ color: 'var(--tg-theme-text-color, #000000)' }}
              />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className={`p-3 rounded-full flex items-center justify-center transition-all ${
              !inputText.trim() || isLoading
                ? 'text-gray-300 scale-90'
                : 'bg-[#0088cc] text-white shadow-md active:scale-95'
            }`}
            style={inputText.trim() && !isLoading ? { backgroundColor: 'var(--tg-theme-button-color, #0088cc)', color: 'var(--tg-theme-button-text-color, #ffffff)' } : {}}
          >
            <Send size={22} fill={inputText.trim() && !isLoading ? "currentColor" : "none"} />
          </button>
        </form>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.05); border-radius: 10px; }
        .markdown-content p { margin-bottom: 0.5rem; white-space: pre-wrap; }
        .markdown-content p:last-child { margin-bottom: 0; }
        .markdown-content strong { font-weight: 800; color: inherit; }
        .markdown-content a { color: #0088cc; text-decoration: underline; font-weight: 600; }
        .markdown-content a:hover { opacity: 0.8; }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
