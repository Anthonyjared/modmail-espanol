const moment = require('moment');
const threads = require("../data/threads");
const utils = require('../utils');
const config = require('../config');

const {THREAD_STATUS} = require('../data/constants');

module.exports = ({ bot, knex, config, commands }) => {
  // Check for threads that are scheduled to be suspended and suspend them
  async function applyScheduledSuspensions() {
    const threadsToBeSuspended = await threads.getThreadsThatShouldBeSuspended();
    for (const thread of threadsToBeSuspended) {
      if (thread.status === THREAD_STATUS.OPEN) {
        await thread.suspend();
        await thread.postSystemMessage(`**Hilo suspendido** según lo previsto por ${thread.scheduled_suspend_name}. Este hilo actuará como cerrado hasta que no se desuspenda con \`${config.prefix}unsuspend\``);
      }
    }
  }

  async function scheduledSuspendLoop() {
    try {
      await applyScheduledSuspensions();
    } catch (e) {
      console.error(e);
    }

    setTimeout(scheduledSuspendLoop, 2000);
  }

  scheduledSuspendLoop();

  commands.addInboxThreadCommand('suspend cancel', [], async (msg, args, thread) => {
    // Cancel timed suspend
    if (thread.scheduled_suspend_at) {
      await thread.cancelScheduledSuspend();
      thread.postSystemMessage(`Suspensión cancelada`);
    } else {
      thread.postSystemMessage(`El hilo no está previsto para ser suspendido`);
    }
  });

  commands.addInboxThreadCommand('suspend', '[delay:delay]', async (msg, args, thread) => {
    if (args.delay) {
      const suspendAt = moment.utc().add(args.delay, 'ms');
      await thread.scheduleSuspend(suspendAt.format('YYYY-MM-DD HH:mm:ss'), msg.author);

      thread.postSystemMessage(`El hilo será suspendido en ${utils.humanizeDelay(args.delay)}. Usa \`${config.prefix}suspend cancel\` para cancelar.`);

      return;
    }

    await thread.suspend();
    thread.postSystemMessage(`**Hilo suspendido!** Este hilo actuará como cerrado hasta que no se desuspenda con \`${config.prefix}unsuspend\``);
  });

  commands.addInboxServerCommand('unsuspend', [], async (msg, args, thread) => {
    if (thread) {
      thread.postSystemMessage(`El hilo no está suspendido!`);
      return;
    }

    thread = await threads.findSuspendedThreadByChannelId(msg.channel.id);
    if (! thread) {
      thread.postSystemMessage(`No estás en un hilo!`);
      return;
    }

    const otherOpenThread = await threads.findOpenThreadByUserId(thread.user_id);
    if (otherOpenThread) {
      thread.postSystemMessage(`No se puede desuspender; hay otro hilo abierto con este usuario: <#${otherOpenThread.channel_id}>`);
      return;
    }

    await thread.unsuspend();
    thread.postSystemMessage(`**Hilo desuspendido!**`);
  });
};
