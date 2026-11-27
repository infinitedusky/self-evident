# The model proxy, as an integration

Role: Models. Other vendors' models for the agents. A model proxy is a gateway that speaks Anthropic's Messages API
(`/v1/messages`, with streaming and tool calls) and serves other vendors' models behind it: a company's own (Lazer's
is the first we used), or LiteLLM. Evident's agents are Claude Code's loop through the Agent SDK; pointed at such a
gateway, the same loop runs on whatever model the gateway names. (Sandy, 2026-11-26; LOG.md, "A model per job, and a
proxy for other vendors' models".)

## Set it up, once

Settings › All apps › Integrations › Model proxy:

- **Address**: the gateway's address, with or without `/v1` (`https://proxy.example.com`).
- **Key variable**: the NAME of the variable holding its key. The key is pasted below it and kept on this computer
  (`~/.self-evident/secrets.env`), or it is already in the engine's environment under that name.
- **Models offered**: the gateway's own names for the models you want to choose from, commas between. Only models
  that make tool calls: an agent cannot work without them.
- **Small model**: the one for titles and other small calls. Empty, a job's own model does them.

**Check** asks each model offered for one word, so a mistyped name is found there and not by a build.

An app can override any field under its own Integrations, as with the others: a client's app on the client's proxy.

## Choose a model per job

Under an app's Settings › Agents, **Model per job**. The jobs: Conversation, Prototype, Checks before the build,
Plan, Build, Check after the build. A job left alone runs on the app's model, as before. The first use is the
reviewer from another vendor: Check after the build on a model that did not build it.

## What to know

- A job on the proxy that can't run (no proxy, no key) says so and does not start. It never falls back to the app's
  model.
- The proxy's bill and Lazer's (or whoever runs it) view of the code: a job on the proxy sends the code it reads
  there. Choose per app.
- The cost shown on a run or a reply is Claude Code's guess for a model it does not know. The proxy's own dashboard
  has the real figure.
- Left open-ended, another vendor's model may pick up heavy skills and wander (the first try took four minutes on an
  eight-line change). The engine's jobs are narrow and have turn limits; keep them so.
- Changing a conversation's model takes effect when the conversation is next opened. One model carries on another's
  conversation, in both directions.
- A conversation taken to the terminal carries on there on the app's Claude account, not the proxy.
- One proxy per app. A second gateway for the same app is not built.
