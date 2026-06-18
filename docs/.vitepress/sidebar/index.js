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
  langchainSidebar,
  electronSidebar,
  aiAgentSidebar,
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
  "/handbook/cdp/": cdpSidebar,
  "/english/": englishSidebar,
};

export default mySideBar;
