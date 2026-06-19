import { guideSidebar } from "./guide";
import { computerSidebar, httpSidebar } from "./computer";
import { inspirationSidebar } from "./inspiration";
import { englishSidebar } from "./english";
import {
  javascriptSidebar,
  html5Sidebar,
  nodeSidebar,
  css3Sidebar,
  axiosSidebar,
  vueSidebar,
  fastapiSidebar,
  reactSidebar,
  golangSidebar,
  pythonSidebar,
  mysqlSidebar,
  redisSidebar,
  langchainSidebar,
  electronSidebar,
  aiAgentSidebar,
  aiSddSidebar,
  aiAgentRawSidebar,
  cdpSidebar,
} from "./handbook";

const mySideBar = {
  "/guide/": guideSidebar,
  // "/computer/": computerSidebar,
  "/computer/http/": httpSidebar,
  "/inspiration/": inspirationSidebar,
  "/handbook/javascript/": javascriptSidebar,
  "/handbook/react/": reactSidebar,
  "/handbook/fastapi/": fastapiSidebar,
  "/handbook/golang/": golangSidebar,
  "/handbook/mysql/": mysqlSidebar,
  "/handbook/python/": pythonSidebar,
  "/handbook/html5/": html5Sidebar,
  "/handbook/node/": nodeSidebar,
  "/handbook/css3/": css3Sidebar,
  "/handbook/axios/": axiosSidebar,
  "/handbook/vue/": vueSidebar,
  "/handbook/langchain/": langchainSidebar,
  "/handbook/electron/": electronSidebar,
  "/handbook/ai-agent/": aiAgentSidebar,
  "/handbook/ai-sdd/": aiSddSidebar,
  "/handbook/ai-agent-raw/": aiAgentRawSidebar,
  "/handbook/cdp/": cdpSidebar,
  "/english/": englishSidebar,
  "/handbook/redis/": redisSidebar,
};

export default mySideBar;
