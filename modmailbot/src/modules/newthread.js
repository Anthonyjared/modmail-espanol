const utils = require("../utils");
const threads = require("../data/threads");

module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxServerCommand('newthread', '<userId:userId>', async (msg, args, thread) => {
    const user = bot.users.get(args.userId);
    if (! user) {
      utils.postSystemMessageWithFallback(msg.channel, thread, 'Usuario no encontrado!');
      return;
    }

    const existingThread = await threads.findOpenThreadByUserId(user.id);
    if (existingThread) {
      utils.postSystemMessageWithFallback(msg.channel, thread, `No se puede crear un nuevo hilo; hay uno ya abierto con el usuario: <#${existingThread.channel_id}>`);
      return;
    }

    const createdThread = await threads.createNewThreadForUser(user, true, true);
    createdThread.postSystemMessage(`El hilo fue abierto por ${msg.author.username}#${msg.author.discriminator}`);

    msg.channel.createMessage(`Hilo abierto: <#${createdThread.channel_id}>`);
  });
};
