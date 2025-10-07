#!/bin/bash

# PM2 Cluster Management Script for Video Player
# Usage: ./pm2-cluster.sh [start|stop|restart|status|logs|monitor]

case "$1" in
    start)
        echo "🚀 Starting Video Player in cluster mode..."
        pm2 start ecosystem.config.js --env production
        ;;
    stop)
        echo "🛑 Stopping Video Player cluster..."
        pm2 stop video-player
        ;;
    restart)
        echo "🔄 Restarting Video Player cluster..."
        pm2 restart video-player
        ;;
    reload)
        echo "🔄 Reloading Video Player cluster (zero-downtime)..."
        pm2 reload video-player
        ;;
    status)
        echo "📊 Video Player cluster status:"
        pm2 status video-player
        ;;
    logs)
        echo "📝 Video Player logs:"
        pm2 logs video-player --lines 50
        ;;
    monitor)
        echo "📈 Opening PM2 monitor..."
        pm2 monit
        ;;
    scale)
        if [ -z "$2" ]; then
            echo "Usage: $0 scale <number_of_instances>"
            exit 1
        fi
        echo "⚖️ Scaling to $2 instances..."
        pm2 scale video-player $2
        ;;
    *)
        echo "Video Player PM2 Cluster Management"
        echo "Usage: $0 {start|stop|restart|reload|status|logs|monitor|scale}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the cluster"
        echo "  stop     - Stop the cluster"
        echo "  restart  - Restart the cluster"
        echo "  reload   - Zero-downtime reload"
        echo "  status   - Show cluster status"
        echo "  logs     - Show recent logs"
        echo "  monitor  - Open PM2 monitor"
        echo "  scale N  - Scale to N instances"
        exit 1
        ;;
esac
