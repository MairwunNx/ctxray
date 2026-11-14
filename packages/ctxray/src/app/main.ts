#!/usr/bin/env bun
import { createContainer } from "./container.ts";

const container = createContainer(process.env);
await container.dispose();
