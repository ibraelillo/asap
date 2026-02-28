import { Suspense, lazy } from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { AppShell, useAppShellData } from "./components/layout/AppShell";

const ResultsPage = lazy(() =>
  import("./components/ranging/ResultsPage").then((module) => ({
    default: module.ResultsPage,
  })),
);
const BacktestDetailsPage = lazy(() =>
  import("./components/ranging/BacktestDetailsPage").then((module) => ({
    default: module.BacktestDetailsPage,
  })),
);
const TradeAnalysisPage = lazy(() =>
  import("./components/ranging/TradeAnalysisPage").then((module) => ({
    default: module.TradeAnalysisPage,
  })),
);
const StrategiesPage = lazy(() =>
  import("./components/ranging/pages/StrategiesPage").then((module) => ({
    default: module.StrategiesPage,
  })),
);
const StrategyDetailsPage = lazy(() =>
  import("./components/ranging/pages/StrategyDetailsPage").then((module) => ({
    default: module.StrategyDetailsPage,
  })),
);
const BotsIndexPage = lazy(() =>
  import("./components/ranging/pages/BotsIndexPage").then((module) => ({
    default: module.BotsIndexPage,
  })),
);
const BotCreatePage = lazy(() =>
  import("./components/ranging/pages/BotCreatePage").then((module) => ({
    default: module.BotCreatePage,
  })),
);
const AccountsPage = lazy(() =>
  import("./components/ranging/pages/AccountsPage").then((module) => ({
    default: module.AccountsPage,
  })),
);
const BotDetailsPage = lazy(() =>
  import("./components/ranging/pages/BotDetailsPage").then((module) => ({
    default: module.BotDetailsPage,
  })),
);
const BotBacktestsPage = lazy(() =>
  import("./components/ranging/pages/BotBacktestsPage").then((module) => ({
    default: module.BotBacktestsPage,
  })),
);
const BotPositionsPage = lazy(() =>
  import("./components/ranging/pages/BotPositionsPage").then((module) => ({
    default: module.BotPositionsPage,
  })),
);

function RouteFallback() {
  return (
    <div className="panel p-6 text-sm text-slate-300">Loading page...</div>
  );
}

function ResultsRoutePage() {
  const navigate = useNavigate();
  const {
    dashboard,
    dashboardError,
    isDashboardLoading,
    realtimeState,
    realtimeDetails,
    apiUrl,
  } = useAppShellData();

  return (
    <ResultsPage
      data={dashboard}
      isLoading={isDashboardLoading}
      error={dashboardError}
      realtimeState={realtimeState}
      realtimeDetails={realtimeDetails}
      apiUrl={apiUrl}
      onOpenBot={(botId) => navigate(`/bots/${encodeURIComponent(botId)}`)}
    />
  );
}

function TradeAnalysisRoutePage() {
  const { dashboard } = useAppShellData();
  return <TradeAnalysisPage data={dashboard} />;
}

function NotFoundPage() {
  return (
    <div className="panel p-6">
      <p className="text-sm text-slate-300">Unknown route.</p>
    </div>
  );
}

function BacktestDetailsPageRoute() {
  const { botId, backtestId } = useParams<{
    botId: string;
    backtestId: string;
  }>();

  if (!botId || !backtestId) {
    return <Navigate to="/bots" replace />;
  }

  return <BacktestDetailsPage botId={botId} backtestId={backtestId} />;
}

export default function Root() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/results" replace />} />
        <Route
          path="/results"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ResultsRoutePage />
            </Suspense>
          }
        />
        <Route
          path="/strategies"
          element={
            <Suspense fallback={<RouteFallback />}>
              <StrategiesPage />
            </Suspense>
          }
        />
        <Route
          path="/strategies/:strategyId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <StrategyDetailsPage />
            </Suspense>
          }
        />
        <Route
          path="/bots"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BotsIndexPage />
            </Suspense>
          }
        />
        <Route
          path="/accounts"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AccountsPage />
            </Suspense>
          }
        />
        <Route
          path="/bots/create"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BotCreatePage />
            </Suspense>
          }
        />
        <Route
          path="/bots/:botId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BotDetailsPage />
            </Suspense>
          }
        />
        <Route
          path="/bots/:botId/backtests"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BotBacktestsPage />
            </Suspense>
          }
        />
        <Route
          path="/bots/:botId/backtests/:backtestId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BacktestDetailsPageRoute />
            </Suspense>
          }
        />
        <Route
          path="/bots/:botId/positions"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BotPositionsPage />
            </Suspense>
          }
        />
        <Route
          path="/trade-analysis"
          element={
            <Suspense fallback={<RouteFallback />}>
              <TradeAnalysisRoutePage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
