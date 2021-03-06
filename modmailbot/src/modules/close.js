const moment = require('moment');
const Eris = require('eris');
const config = require('../config');
const utils = require('../utils');
const threads = require('../data/threads');
const blocked = require('../data/blocked');
const {messageQueue} = require('../queue');

module.exports = ({ bot, knex, config, commands }) => {
  // Check for threads that are scheduled to be closed and close them
  async function applyScheduledCloses() {
    const threadsToBeClosed = await threads.getThreadsThatShouldBeClosed();
    for (const thread of threadsToBeClosed) {
      if (config.closeMessage && ! thread.scheduled_close_silent) {
        const closeMessage = utils.readMultilineConfigValue(config.closeMessage);
        await thread.postToUser(closeMessage).catch(() => {});
      }

      await thread.close(false, thread.scheduled_close_silent);

      const logUrl = await thread.getLogUrl();
      utils.postLog(utils.trimAll(`
        El hilo de ${thread.user_name} (${thread.user_id}) se cerró según lo previsto por ${thread.scheduled_close_name}
        Logs: ${logUrl}
      `));
    }
  }

  async function scheduledCloseLoop() {
    try {
      await applyScheduledCloses();
    } catch (e) {
      console.error(e);
    }

    setTimeout(scheduledCloseLoop, 2000);
  }

  scheduledCloseLoop();

  // Close a thread. Closing a thread saves a log of the channel's contents and then deletes the channel.
  commands.addGlobalCommand('close', '[opts...]', async (msg, args) => {
    let thread, closedBy;

    let hasCloseMessage = !! config.closeMessage;
    let silentClose = false;

    if (msg.channel instanceof Eris.PrivateChannel) {
      // User is closing the thread by themselves (if enabled)
      if (! config.allowUserClose) return;
      if (await blocked.isBlocked(msg.author.id)) return;

      thread = await threads.findOpenThreadByUserId(msg.author.id);
      if (! thread) return;

      // We need to add this operation to the message queue so we don't get a race condition
      // between showing the close command in the thread and closing the thread
      await messageQueue.add(async () => {
        thread.postSystemMessage('El hilo fue cerrado por el usuario, cerrando...');
        await thread.close(true);
      });

      closedBy = 'the user';
    } else {
      // A staff member is closing the thread
      if (! utils.messageIsOnInboxServer(msg)) return;
      if (! utils.isStaff(msg.member)) return;

      thread = await threads.findOpenThreadByChannelId(msg.channel.id);
      if (! thread) return;

      if (args.opts && args.opts.length) {
        if (args.opts.includes('cancel') || args.opts.includes('c')) {
          // Cancel timed close
          if (thread.scheduled_close_at) {
            await thread.cancelScheduledClose();
            thread.postSystemMessage(`Cierre cancelado`);
          }

          return;
        }

        // Silent close (= no close message)
        if (args.opts.includes('silent') || args.opts.includes('s')) {
          silentClose = true;
        }

        // Timed close
        const delayStringArg = args.opts.find(arg => utils.delayStringRegex.test(arg));
        if (delayStringArg) {
          const delay = utils.convertDelayStringToMS(delayStringArg);
          if (delay === 0 || delay === null) {
            thread.postSystemMessage(`Demora especificada inválida. Formato: "1h30m"`);
            return;
          }

          const closeAt = moment.utc().add(delay, 'ms');
          await thread.scheduleClose(closeAt.format('YYYY-MM-DD HH:mm:ss'), msg.author, silentClose ? 1 : 0);

          let response;
          if (silentClose) {
            response = `El hilo ahora está programado para ser cerrado en silencio en ${utils.humanizeDelay(delay)}. Usa \`${config.prefix}close cancel\` para cancelar.`;
          } else {
            response = `El hilo ahora está programado para ser cerrado en silencio en ${utils.humanizeDelay(delay)}. Usa \`${config.prefix}close cancel\` para cancelarl.`;
          }

          thread.postSystemMessage(response);

          return;
        }
      }

      // Regular close
      await thread.close(false, silentClose);
      closedBy = msg.author.username;
    }

    // Send close message (unless suppressed with a silent close)
    if (hasCloseMessage && ! silentClose) {
      const closeMessage = utils.readMultilineConfigValue(config.closeMessage);
      await thread.postToUser(closeMessage).catch(() => {});
    }

    const logUrl = await thread.getLogUrl();
    utils.postLog(utils.trimAll(`
      Modmail thread with ${thread.user_name} (${thread.user_id}) was closed by ${closedBy}
      Logs: ${logUrl}
    `));
  });

  // Auto-close threads if their channel is deleted
  bot.on('channelDelete', async (channel) => {
    if (! (channel instanceof Eris.TextChannel)) return;
    if (channel.guild.id !== utils.getInboxGuild().id) return;

    const thread = await threads.findOpenThreadByChannelId(channel.id);
    if (! thread) return;

    console.log(`[INFO] Auto-closing thread with ${thread.user_name} because the channel was deleted`);
    if (config.closeMessage) {
      const closeMessage = utils.readMultilineConfigValue(config.closeMessage);
      await thread.postToUser(closeMessage).catch(() => {});
    }

    await thread.close(true);

    const logUrl = await thread.getLogUrl();
    utils.postLog(utils.trimAll(`
      Modmail thread with ${thread.user_name} (${thread.user_id}) was closed automatically because the channel was deleted
      Logs: ${logUrl}
    `));
  });
};
