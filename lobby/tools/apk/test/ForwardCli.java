import bg.arena.play.Forwarder;

import java.net.InetSocketAddress;

/**
 * Същият препращач като в каската, пуснат на компютър (за проби с истински браузър или WebSocket):
 *
 *   java -cp build\pctest ForwardCli 47899 127.0.0.1:47801
 *
 * После http://localhost:47899/play/ е играта, минала през препращача. Спира се с Ctrl+C.
 */
public class ForwardCli {
    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.out.println("ForwardCli <местен порт> <адрес:порт>");
            return;
        }
        int listen = Integer.parseInt(args[0]);
        String host = args[1].substring(0, args[1].lastIndexOf(':'));
        int port = Integer.parseInt(args[1].substring(args[1].lastIndexOf(':') + 1));
        final InetSocketAddress target = new InetSocketAddress(host, port);
        Forwarder f = new Forwarder(listen, () -> target, new Forwarder.Events() {
            @Override public void log(String line) {
                System.out.println(line);
            }

            @Override public void upstream(boolean ok) {
            }

            @Override public void active(int count) {
            }
        });
        f.start();
        System.out.println("READY localhost:" + listen + " -> " + target);
        Thread.sleep(Long.MAX_VALUE);
    }
}
