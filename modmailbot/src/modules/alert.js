module.exports = ({ bot, knex, config, commands }) => {
  commands.addInboxThreadCommand('alert', '[opt:string]', async (msg, args, thread) => {
    if (args.opt && args.opt.startsWith('c')) {
      await thread.setAlert(null);
      await thread.postSystemMessage(`Alerta de nuevo mensaje cancelada`);
    } else {
      await thread.setAlert(msg.author.id);
      await thread.postSystemMessage(`Mencionando a ${msg.author.username}#${msg.author.discriminator} cuando este hilo obtenga una nueva respuesta`);
    }
  });
};
