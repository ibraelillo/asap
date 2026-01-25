import { useState, useEffect } from "react";
import { Plus, Bot, Activity } from "lucide-react";
import type { BotConfig, BotConfigCreate } from "@repo/bot-config";
import { BotCard } from "./BotCard";
import { BotForm } from "./BotForm";
import { api } from "../lib/api";
import useSWR from "swr";

export function Dashboard() {
  const [showForm, setShowForm] = useState(false);
  const [editingBot, setEditingBot] = useState<BotConfig | undefined>();


  const { data: bots = [], isLoading, mutate } = useSWR("bots", async () => {
      return await api.getBots();
  }, { fallbackData: []})

  const handleCreateBot = async (botData: BotConfigCreate) => {
    try {
      const newBot = await api.createBot(botData);
      await  mutate([...bots, newBot])
      setShowForm(false);
    } catch (error) {
      console.error("Failed to create bot:", error);
    }
  };

  const handleUpdateBot = async (botData: BotConfigCreate) => {
    if (!editingBot) return;

    try {
      await api.updateBot(editingBot.PK, botData);
      await mutate()
      setEditingBot(undefined);
      setShowForm(false);
    } catch (error) {
      console.error("Failed to update bot:", error);
    }
  };

  const handleToggleBot = async (id: string) => {
    try {
      await api.toggleBot(id);
      await mutate()
    } catch (error) {
      console.error("Failed to toggle bot:", error);
    }
  };

  const handleEditBot = (bot: BotConfig) => {
    setEditingBot(bot);
    setShowForm(true);
  };

  const activeBots = bots.filter((bot) => bot.enabled).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading bots...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Bot className="w-8 h-8 text-blue-600" />
                Trading Bots
              </h1>
              <p className="text-gray-600 mt-1">
                Manage your automated trading strategies
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Bot
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Bot className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Total Bots
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {bots.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Activity className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Active Bots
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {activeBots}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Activity className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Success Rate
                  </p>
                  <p className="text-2xl font-bold text-gray-900">--</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bots Grid */}
        {bots.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No bots yet
            </h3>
            <p className="text-gray-600 mb-4">
              Create your first trading bot to get started
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Bot
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bots.map((bot) => (
              <BotCard
                key={bot.PK}
                bot={bot}
                onToggle={handleToggleBot}
                onEdit={handleEditBot}
              />
            ))}
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <BotForm
            bot={editingBot}
            onSave={editingBot ? handleUpdateBot : handleCreateBot}
            onClose={() => {
              setShowForm(false);
              setEditingBot(undefined);
            }}
          />
        )}
      </div>
    </div>
  );
}
